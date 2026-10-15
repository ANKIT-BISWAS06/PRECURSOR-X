"""
Risk Intelligence API Routes.
Provides multi-dimensional risk filtering, dynamic 5x5 risk matrix calculations, and facility telemetry
powered by PostgreSQL.
"""

from typing import List, Optional
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from ...schemas.risk import SiteAssetSchema, RiskMatrixResponse, RiskTelemetryResponse
from ...services.risk_service import risk_service
from ...db.session import get_db

router = APIRouter(prefix="/risk-intelligence", tags=["Risk Intelligence"])


@router.get("/telemetry", response_model=RiskTelemetryResponse, summary="Get Risk Telemetry Summary")
def get_risk_telemetry(
    site: Optional[str] = Query("all", description="Facility filter"),
    timeframe: Optional[str] = Query("90", description="Timeframe in days (30, 90, 180, 365)"),
    db: Session = Depends(get_db)
) -> RiskTelemetryResponse:
    """
    Returns aggregated facility telemetry, critical/high facility counts, and mean barrier integrity
    derived from PostgreSQL records.
    """
    return risk_service.get_telemetry(db=db, site=site, timeframe=timeframe)


@router.get("/matrix", response_model=RiskMatrixResponse, summary="Get Dynamic 5x5 Risk Matrix")
def get_risk_matrix(
    timeframe: Optional[str] = Query("90", description="Timeframe in days"),
    site: Optional[str] = Query("all", description="Facility filter"),
    activity: Optional[str] = Query("all", description="Operational activity filter"),
    lsr: Optional[str] = Query("all", description="Life-saving rule filter"),
    db: Session = Depends(get_db)
) -> RiskMatrixResponse:
    """
    Returns 25-cell consequence vs. likelihood matrix calculated from database risk observations.
    """
    return risk_service.get_matrix(db=db, timeframe=timeframe, site=site, activity=activity, lsr=lsr)


@router.get("/facilities", response_model=List[SiteAssetSchema], summary="Get Filtered Facilities Registry")
def get_risk_facilities(
    site: Optional[str] = Query("all", description="Facility filter"),
    activity: Optional[str] = Query("all", description="Activity filter"),
    lsr: Optional[str] = Query("all", description="LSR filter"),
    timeframe: Optional[str] = Query("90", description="Timeframe in days"),
    severity: Optional[str] = Query("all", description="Severity threshold filter"),
    search: Optional[str] = Query(None, description="Search query"),
    db: Session = Depends(get_db)
) -> List[SiteAssetSchema]:
    """
    Returns facilities queried from PostgreSQL filtered by site, activity, LSR, severity, and text search.
    """
    return risk_service.get_facilities(
        db=db,
        site=site,
        activity=activity,
        lsr=lsr,
        timeframe=timeframe,
        severity=severity,
        search=search
    )
