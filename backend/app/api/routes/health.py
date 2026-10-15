"""
Health check route.
"""

from fastapi import APIRouter
from ...schemas.common import HealthResponse
from ...core.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Service Health Check")
def get_health() -> HealthResponse:
    """
    Returns system status, service name, version, and environment.
    Does not require database or external services.
    """
    return HealthResponse(
        status="ok",
        service="precursor-x-backend",
        version=settings.VERSION,
        environment=settings.APP_ENV
    )
