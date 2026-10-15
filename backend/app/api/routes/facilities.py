"""
Facilities Registry API Routes.
Provides dynamic list of industrial facility assets strictly queried from PostgreSQL.
"""

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...schemas.risk import FacilitySummarySchema
from ...services.risk_service import risk_service
from ...db.session import get_db

router = APIRouter(prefix="/facilities", tags=["Facilities"])


@router.get("", response_model=List[FacilitySummarySchema], summary="Get All Facilities")
def get_facilities(db: Session = Depends(get_db)) -> List[FacilitySummarySchema]:
    """
    Returns id, code, name, region, and type for all facilities queried from PostgreSQL.
    """
    return risk_service.get_facilities_summary(db=db)
