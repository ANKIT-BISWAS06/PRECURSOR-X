"""
Authoritative FastAPI Dependencies for PRECURSOR-X.
Provides secure database session and authenticated operator identity verification.
Supports HttpOnly cookie authentication and Authorization Bearer headers.
"""

import logging
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models.entities import User
from ..core.security import decode_access_token
from ..core.config import settings

logger = logging.getLogger("precursor_x.deps")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Authoritative dependency that enforces authenticated session verification on operational routes.
    Extracts JWT from HttpOnly cookie (primary browser mechanism) or Bearer header.
    Validates token signature and expiration, looks up user in PostgreSQL, and verifies active status.
    Raises HTTP 401 if unauthenticated, or HTTP 403 if user account is deactivated.
    """
    token: Optional[str] = None

    # 1. Check HttpOnly cookie first (secure browser authentication mechanism)
    cookie_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    cookie_present = cookie_token is not None
    if cookie_token:
        token = cookie_token
    else:
        # 2. Check Authorization header for programmatic / API clients
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    # Diagnostic audit log: cookie *presence* only (never its value), path, and
    # outcome. Lets a production deploy be verified end-to-end (login -> cookie
    # accepted by browser -> sent back on the next request) purely from logs,
    # without ever logging the JWT, password, or any secret.
    def _audit(result: str, **extra: object) -> None:
        logger.info(
            "auth.check path=%s method=%s cookie_present=%s result=%s%s",
            request.url.path,
            request.method,
            cookie_present,
            result,
            "".join(f" {k}={v}" for k, v in extra.items()),
        )

    if not token:
        _audit("401_no_credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required. Please sign in to access PRECURSOR-X console."
        )

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        _audit("401_invalid_or_expired_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or token invalid. Please sign in again."
        )

    user_id = payload["sub"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        _audit("401_user_not_found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this session was not found."
        )

    if not user.is_active:
        _audit("403_user_inactive", user_id=user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact your process safety lead."
        )

    _audit("200_authenticated", user_id=user.id)
    return user
