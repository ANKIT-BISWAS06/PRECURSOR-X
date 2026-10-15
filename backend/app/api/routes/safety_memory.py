"""
Safety Memory API Routes.
Provides keyword and fingerprint search across organizational precedent memory
queried directly from PostgreSQL.
"""

from typing import Optional
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from ...schemas.memory import SafetyMemorySearchResponse
from ...services.memory_service import memory_service
from ...db.session import get_db

router = APIRouter(prefix="/safety-memory", tags=["Safety Memory"])


@router.get("/search", response_model=SafetyMemorySearchResponse, summary="Search Institutional Safety Precedents")
def search_safety_memory(
    query: Optional[str] = Query("", description="Search narrative or keyword"),
    mode: Optional[str] = Query("keyword", description="Search algorithm mode: keyword or fingerprint"),
    facility: Optional[str] = Query("all", description="Facility filter"),
    severity: Optional[str] = Query("all", description="SIF potential level filter"),
    category: Optional[str] = Query("all", description="Precursor category filter"),
    db: Session = Depends(get_db)
) -> SafetyMemorySearchResponse:
    """
    Retrieves historical near-miss and incident precedents from PostgreSQL with dynamic total record count.
    """
    return memory_service.search_memory(
        db=db,
        query=query,
        mode=mode,
        facility=facility,
        severity=severity,
        category=category
    )
