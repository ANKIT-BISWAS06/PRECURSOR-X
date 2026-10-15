"""
Authentication Pydantic schemas for PRECURSOR-X.
Enforces strict input validation, email normalization, password complexity rules,
and prevents client-side role privilege escalation.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator

SAFE_DEFAULT_ROLE = "safety_engineer"
ALLOWED_SELF_REGISTER_ROLES = {"safety_engineer"}
FORBIDDEN_SELF_REGISTER_ROLES = {"executive", "administrator", "admin", "reviewer", "lead_auditor", "superuser"}


class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=128, description="User full legal or corporate name")
    email: str = Field(..., description="Corporate or operational email address")
    password: str = Field(..., min_length=8, max_length=128, description="Account password (min 8 characters, complex)")
    confirm_password: Optional[str] = Field(None, description="Password confirmation")
    role: Optional[str] = Field(None, description="Self-registration cannot request privileged roles")

    @field_validator("email")
    @classmethod
    def validate_and_normalize_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if "@" not in clean or "." not in clean.split("@")[-1] or len(clean) < 5:
            raise ValueError("A valid corporate email address is required (e.g., engineer@facility.com).")
        return clean

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_upper and has_lower and has_digit):
            raise ValueError("Password must contain at least one uppercase letter, one lowercase letter, and one number.")
        return v

    @field_validator("role")
    @classmethod
    def prevent_privilege_escalation(cls, v: Optional[str]) -> str:
        if not v:
            return SAFE_DEFAULT_ROLE
        clean_role = v.strip().lower()
        if clean_role in FORBIDDEN_SELF_REGISTER_ROLES or clean_role not in ALLOWED_SELF_REGISTER_ROLES:
            raise ValueError(
                f"Self-registration for role '{clean_role}' is prohibited. "
                "Privileged roles must be assigned via corporate safety administration."
            )
        return clean_role


class UserLoginRequest(BaseModel):
    email: str = Field(..., description="Account email address")
    password: str = Field(..., description="Account password")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    user: UserResponse
    token_type: str = "cookie"
    message: str = "Authentication session established."
