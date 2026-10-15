"""
PRECURSOR-X FastAPI Application.
High-consequence process safety precursor intelligence and SIF barrier governance engine.
Authoritative data backed by PostgreSQL and Groq Cloud AI.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.origin_guard import OriginGuardMiddleware
from .api.deps import get_current_user
from .api.routes import (
    health_router,
    public_router,
    dashboard_router,
    report_analyzer_router,
    risk_intelligence_router,
    safety_dna_router,
    safety_memory_router,
    knowledge_graph_router,
    what_changed_router,
    interventions_router,
    human_review_router,
    facilities_router,
    auth_router,
)

logger = logging.getLogger("precursor_x")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager:
    Ensures PostgreSQL database schema and initial seed data are populated on boot.
    """
    try:
        from .db.seed import seed_database
        seed_database(force=False)
        logger.info("Database schema and canonical seed verified.")
    except Exception as e:
        logger.warning(f"Database bootstrap notice (will retry on next request): {e}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "PRECURSOR-X is an enterprise process safety precursor diagnostics platform. "
        "It identifies weak signals, calculates precursor velocity divergence, analyzes incident narratives with Groq AI, "
        "and coordinates corrective barrier interventions to prevent Serious Injuries and Fatalities (SIF)."
    ),
    # Interactive API docs / OpenAPI schema are public by design in FastAPI; expose them only outside production
    # so the production surface is limited to /health and /auth/* plus authenticated operational routes.
    docs_url=None if settings.APP_ENV == "production" else "/docs",
    redoc_url=None if settings.APP_ENV == "production" else "/redoc",
    openapi_url=None if settings.APP_ENV == "production" else f"{settings.API_PREFIX}/openapi.json",
    lifespan=lifespan
)

# Configure CORS with strict production origin enforcement
cors_kwargs = {
    "allow_origins": settings.ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
}
if settings.APP_ENV != "production":
    cors_kwargs["allow_origin_regex"] = r"https://.*\.onrender\.com"

app.add_middleware(CORSMiddleware, **cors_kwargs)

# CSRF defence in depth: state-changing requests that carry an Origin header must come from a trusted origin.
app.add_middleware(
    OriginGuardMiddleware,
    allowed_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=cors_kwargs.get("allow_origin_regex"),
)

# 1. Public endpoints (No session credentials required)
app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(public_router, prefix=settings.API_PREFIX)
app.include_router(auth_router, prefix=settings.API_PREFIX)

# 2. Authoritative protected operational endpoints (Strictly require authenticated User session)
operational_auth = [Depends(get_current_user)]
app.include_router(dashboard_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(report_analyzer_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(risk_intelligence_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(safety_dna_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(safety_memory_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(knowledge_graph_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(what_changed_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(interventions_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(human_review_router, prefix=settings.API_PREFIX, dependencies=operational_auth)
app.include_router(facilities_router, prefix=settings.API_PREFIX, dependencies=operational_auth)


@app.get("/", tags=["Root"])
def root():
    """
    Root entry redirect / info.
    """
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": None if settings.APP_ENV == "production" else "/docs",
        "health": f"{settings.API_PREFIX}/health"
    }


@app.get("/health", tags=["Health"])
def health():
    """
    Root health check for cloud providers (e.g., Render, Kubernetes).
    Does not expose sensitive credentials, keys, or database URLs.
    """
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.APP_ENV
    }
