import os
from typing import List, Union, Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "PRECURSOR-X API"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api/v1"
    APP_ENV: str = "development"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # PostgreSQL Database URL (Render provides postgres:// or postgresql://)
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/precursor_x"

    # Groq AI Service Configuration
    GROQ_API_KEY: Union[str, None] = None
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    # Authentication & Session Security (Backend only - never expose to client)
    # Production strictly requires AUTH_SECRET_KEY from environment with minimum 32 chars.
    AUTH_SECRET_KEY: Optional[str] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Cookie Security Settings
    AUTH_COOKIE_NAME: str = "access_token"
    # None = auto: "lax". Production runs Browser -> same-origin Express server -> FastAPI, so the
    # session cookie is first-party and SameSite=Lax is sufficient and safest. Only set "none" if you
    # deliberately serve the SPA from a different site than the API (requires Secure, which production sets).
    AUTH_COOKIE_SAMESITE: Optional[str] = None
    AUTH_COOKIE_PATH: str = "/"

    # CCPS Domain Thresholds (Configurable Baseline Targets)
    BARRIER_INTEGRITY_TARGET_PCT: float = 85.0
    EXECUTIVE_SIF_THRESHOLD: Optional[int] = 150

    # CORS: Explicit origins for dev and production
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]
    CORS_ORIGINS: Union[str, List[str], None] = None

    @property
    def AUTH_COOKIE_SECURE(self) -> bool:
        """Production cookies MUST be Secure. Local development allows HTTP."""
        return self.APP_ENV.strip().lower() == "production"

    @field_validator("APP_ENV", mode="before")
    @classmethod
    def normalize_app_env(cls, v: str) -> str:
        # Single canonical spelling so "Production" can never bypass production-only checks.
        return (v or "development").strip().lower()

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Union[str, None]) -> str:
        if not v:
            return "postgresql+psycopg://postgres:postgres@localhost:5432/precursor_x"
        if v.startswith("sqlite"):
            return v
        # Render and Heroku use postgres:// or postgresql://; adapt for SQLAlchemy psycopg 3
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+psycopg://", 1)
        if v.startswith("postgresql://") and not v.startswith("postgresql+"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    @staticmethod
    def _split_origins(raw: Union[str, List[str], None]) -> List[str]:
        if not raw:
            return []
        items = raw.split(",") if isinstance(raw, str) else list(raw)
        return [i.strip().rstrip("/") for i in items if i and i.strip()]

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        """
        Enforce fail-fast security policy:
        In production, AUTH_SECRET_KEY is mandatory and must not be a predictable placeholder,
        CORS must name explicit origins (never "*"), and at least one must be an https frontend origin.
        """
        is_production = self.APP_ENV == "production"

        # CORS_ORIGINS (comma separated, used by render.yaml) takes precedence over ALLOWED_ORIGINS.
        env_origins = self._split_origins(self.CORS_ORIGINS)
        if env_origins:
            self.ALLOWED_ORIGINS = env_origins
        else:
            self.ALLOWED_ORIGINS = self._split_origins(self.ALLOWED_ORIGINS)

        # Cookie SameSite policy
        samesite = (self.AUTH_COOKIE_SAMESITE or "lax").strip().lower()
        if samesite not in {"lax", "strict", "none"}:
            raise ValueError("AUTH_COOKIE_SAMESITE must be one of: lax, strict, none.")
        self.AUTH_COOKIE_SAMESITE = samesite

        if is_production:
            if not self.AUTH_SECRET_KEY:
                raise ValueError(
                    "CRITICAL SECURITY CONFIGURATION ERROR: AUTH_SECRET_KEY is required in production environment. "
                    "Set AUTH_SECRET_KEY in environment variables."
                )
            if len(self.AUTH_SECRET_KEY) < 32:
                raise ValueError(
                    "CRITICAL SECURITY CONFIGURATION ERROR: AUTH_SECRET_KEY in production must be at least 32 characters "
                    "of high-entropy random data."
                )
            insecure_placeholders = [
                "change-in-prod",
                "replace_with",
                "your_secure_auth",
                "your_secret_key",
                "precursor-x-secure-auth",
                "1234567890",
            ]
            for placeholder in insecure_placeholders:
                if placeholder in self.AUTH_SECRET_KEY.lower():
                    raise ValueError(
                        f"CRITICAL SECURITY CONFIGURATION ERROR: AUTH_SECRET_KEY contains insecure placeholder '{placeholder}'. "
                        "A cryptographically strong secret must be provided in production."
                    )
            # In production, disallow wildcard CORS
            if any("*" in origin for origin in self.ALLOWED_ORIGINS):
                raise ValueError(
                    "CRITICAL SECURITY CONFIGURATION ERROR: Wildcard CORS origin '*' is forbidden in production with credentials."
                )
            # In production, the deployed frontend origin must be explicitly present (https).
            # Falling back to localhost-only would silently block every browser request.
            if not any(origin.startswith("https://") for origin in self.ALLOWED_ORIGINS):
                raise ValueError(
                    "CRITICAL CONFIGURATION ERROR: production requires CORS_ORIGINS to contain the deployed "
                    "frontend origin (e.g. https://<frontend-host>.onrender.com). No https:// origin is configured."
                )
        else:
            # Development / testing: fallback to local ephemeral dev key if none set
            if not self.AUTH_SECRET_KEY:
                self.AUTH_SECRET_KEY = "precursorx-dev-local-secret-key-entropy-64chars-development-only-ok"

        return self

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


settings = Settings()
