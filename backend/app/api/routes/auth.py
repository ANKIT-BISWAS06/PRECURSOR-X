"""
Authentication and Identity Governance Routes for PRECURSOR-X.
Provides enterprise registration, login, logout, and user profile introspection
backed by the primary PostgreSQL database and HttpOnly session cookies.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from ...db.session import get_db
from ...models.entities import User
from ...schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    AuthResponse,
    SAFE_DEFAULT_ROLE,
)
from ...core.security import (
    hash_password,
    verify_password,
    create_access_token,
    generate_user_id,
)
from ...core.config import settings
from ..deps import get_current_user

logger = logging.getLogger("precursor_x.auth")
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _log_cookie_issued(user: User) -> None:
    """
    Audit log for successful cookie issuance on login/register.
    Records ONLY cookie metadata (name, SameSite, Secure, Path) and the fact that
    Set-Cookie was generated — never the JWT value, password, or AUTH_SECRET_KEY.
    """
    logger.info(
        "auth.login.success user_id=%s set_cookie=true cookie_name=%s samesite=%s secure=%s path=%s",
        user.id,
        settings.AUTH_COOKIE_NAME,
        settings.AUTH_COOKIE_SAMESITE,
        settings.AUTH_COOKIE_SECURE,
        settings.AUTH_COOKIE_PATH,
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new PRECURSOR-X platform operator"
)
def register(
    payload: UserRegisterRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Register a new engineer or safety specialist in PostgreSQL.
    Enforces email normalization, password complexity, Argon2id hashing,
    safe role assignment, and sets an environment-aware HttpOnly cookie.
    """
    clean_email = payload.email.strip().lower()

    if payload.confirm_password and payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password and confirm password entries do not match."
        )

    # Check duplicate email
    existing_user = db.query(User).filter(User.email == clean_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An account with email '{clean_email}' already exists. Please sign in instead."
        )

    # Enforce safe default role to strictly prevent privilege escalation
    assigned_role = SAFE_DEFAULT_ROLE

    # Create new user with Argon2id hash
    user = User(
        id=generate_user_id(),
        email=clean_email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=assigned_role,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        last_login_at=None,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info(f"Registered new operator: {user.email} (id: {user.id}, role: {user.role})")

    # Generate token
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})

    # Set secure HttpOnly cookie
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        secure=settings.AUTH_COOKIE_SECURE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path=settings.AUTH_COOKIE_PATH,
    )
    _log_cookie_issued(user)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token_type="cookie",
        message="Registration complete and session established."
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Authenticate PRECURSOR-X operator"
)
def login(
    payload: UserLoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Verify operator credentials against the PostgreSQL database.
    Rejects invalid credentials or inactive accounts.
    Updates last_login_at timestamp and issues an HttpOnly cookie.
    """
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please verify credentials."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is currently inactive. Contact your facility safety lead."
        )

    # Update login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})

    # Set secure HttpOnly cookie
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        secure=settings.AUTH_COOKIE_SECURE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path=settings.AUTH_COOKIE_PATH,
    )
    _log_cookie_issued(user)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token_type="cookie",
        message="Authentication successful."
    )


@router.post(
    "/logout",
    summary="Terminate session"
)
def logout(response: Response):
    """
    Clear access token HttpOnly cookie and terminate client session.
    """
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        path=settings.AUTH_COOKIE_PATH,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    return {"status": "ok", "message": "Logged out successfully from PRECURSOR-X."}


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get authenticated operator profile"
)
def get_me(user: User = Depends(get_current_user)):
    """
    Return identity details of the currently authenticated operator verified by FastAPI.
    Requires active session via HttpOnly cookie or Bearer token.
    """
    return UserResponse.model_validate(user)
