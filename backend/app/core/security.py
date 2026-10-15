"""
Security and Authentication Utility Module for PRECURSOR-X.
Implements RFC 9106 / OWASP recommended Argon2id password hashing
via argon2-cffi, with bcrypt compatibility verification.
Implements RFC 7519 HS256 JWT generation and verification.
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import timedelta
from typing import Optional, Dict, Any

from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError, InvalidHashError

from .config import settings

logger = logging.getLogger("precursor_x.security")

# OWASP Recommended Argon2id parameters
_argon2_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19456,  # 19 MiB
    parallelism=1,
    hash_len=32,
    type=Type.ID  # Argon2id
)


def generate_user_id() -> str:
    """Generate a prefixed cryptographically secure user identifier."""
    return f"usr_{secrets.token_hex(12)}"


def hash_password(password: str) -> str:
    """
    Hash a plaintext password using Argon2id with OWASP-compliant memory and time cost.
    Never logs or persists plaintext passwords.
    """
    if not password:
        raise ValueError("Password cannot be empty.")
    return _argon2_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plaintext password against a stored hash using constant-time verification.
    Supports Argon2id natively, with fallback verification for bcrypt and legacy hashes.
    Never logs passwords.
    """
    if not plain_password or not hashed_password:
        return False

    try:
        if hashed_password.startswith("$argon2"):
            _argon2_hasher.verify(hashed_password, plain_password)
            return True
        elif hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
            import bcrypt
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        elif hashed_password.startswith("pbkdf2_"):
            # Legacy migration verification support
            parts = hashed_password.split("$")
            if len(parts) == 4 and parts[0] == "pbkdf2_sha256":
                iterations = int(parts[1])
                salt = parts[2]
                expected_hex = parts[3]
                key = hashlib.pbkdf2_hmac(
                    "sha256",
                    plain_password.encode("utf-8"),
                    salt.encode("utf-8"),
                    iterations
                )
                return hmac.compare_digest(key.hex(), expected_hex)
            return False
        else:
            return False
    except (VerifyMismatchError, InvalidHashError):
        return False
    except Exception as e:
        logger.warning(f"Password verification encountered error: {type(e).__name__}")
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generate an HS256-signed JSON Web Token with expiration.
    Signing secret is kept strictly server-side in settings.AUTH_SECRET_KEY.
    """
    if not settings.AUTH_SECRET_KEY:
        raise RuntimeError("AUTH_SECRET_KEY is not configured.")

    to_encode = data.copy()
    now_ts = int(time.time())
    if expires_delta:
        expire_ts = now_ts + int(expires_delta.total_seconds())
    else:
        expire_ts = now_ts + (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    to_encode.update({
        "iat": now_ts,
        "exp": expire_ts,
        "iss": "precursor-x-auth"
    })

    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _b64url_encode(json.dumps(to_encode, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(
        settings.AUTH_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256
    ).digest()
    encoded_signature = _b64url_encode(signature)

    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Validate an HS256 JWT token signature and expiration.
    Returns payload dictionary if valid, None if invalid or expired.
    """
    if not token or not settings.AUTH_SECRET_KEY:
        return None

    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        # Verify signature in constant time
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(
            settings.AUTH_SECRET_KEY.encode("utf-8"),
            signing_input,
            hashlib.sha256
        ).digest()

        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(actual_sig, expected_sig):
            return None

        # Parse payload
        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))

        # Verify expiration
        exp = payload.get("exp")
        if exp and int(time.time()) > exp:
            return None

        return payload
    except Exception as e:
        logger.debug(f"JWT decode failure: {type(e).__name__}")
        return None
