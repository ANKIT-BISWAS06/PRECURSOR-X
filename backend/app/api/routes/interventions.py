"""
Interventions / CAPA API Routes.
Provides lifecycle management for Corrective and Preventive Actions in PostgreSQL
with authenticated operator session verification.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Path, Depends
from sqlalchemy.orm import Session

from ...schemas.intervention import (
    InterventionSchema,
    CreateInterventionRequest,
    CreateInterventionFromPrecursorRequest,
    UpdateInterventionRequest
)
from ...services.intervention_service import intervention_service
from ...models.entities import User
from ...db.session import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/interventions", tags=["Interventions & CAPA"])


@router.get("", response_model=List[InterventionSchema], summary="List All Interventions")
def get_interventions(
    status: Optional[str] = Query(None, description="Status filter (Proposed, Approved, In Progress, Completed)"),
    priority: Optional[str] = Query(None, description="Priority filter (Critical, High, Moderate, Low)"),
    search: Optional[str] = Query(None, description="Search query"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[InterventionSchema]:
    """
    Returns active and archived CAPA interventions queried from PostgreSQL.
    Requires authenticated operator session.
    """
    return intervention_service.get_all(db=db, status=status, priority=priority, search=search)


@router.post("", response_model=InterventionSchema, status_code=201, summary="Create New CAPA Intervention")
def create_intervention(
    payload: CreateInterventionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InterventionSchema:
    """
    Dispatches and persists a new targeted CAPA intervention into PostgreSQL.
    Requires authenticated operator session.
    """
    if not payload.owner:
        payload.owner = current_user.full_name or current_user.email
    return intervention_service.create(db=db, payload=payload)


@router.post("/from-precursor", response_model=InterventionSchema, status_code=201, summary="Create Intervention from Authoritative Precursor Record")
def create_intervention_from_precursor(
    payload: CreateInterventionFromPrecursorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InterventionSchema:
    """
    Creates and persists a targeted CAPA intervention by resolving authoritative fields
    (title, description, facility, pattern, vector, LSR, risk, priority) directly from PostgreSQL.
    Eliminates frontend operational data fabrication. Requires authenticated operator session.
    """
    if payload.actionType != "DISPATCH_CAPA":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported actionType '{payload.actionType}'. Supported values: 'DISPATCH_CAPA'"
        )
    return intervention_service.create_from_precursor(
        db=db,
        precursor_id=payload.precursorId,
        action_type=payload.actionType
    )


@router.patch("/{intervention_id}", response_model=InterventionSchema, summary="Update Intervention Status or Details")
def update_intervention(
    intervention_id: str = Path(..., description="Intervention ID"),
    payload: UpdateInterventionRequest = ...,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InterventionSchema:
    """
    Updates lifecycle status, progress percentage, assignee, or priority in PostgreSQL.
    Requires authenticated operator session.
    """
    updated = intervention_service.update(db=db, intervention_id=intervention_id, payload=payload)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Intervention '{intervention_id}' not found.")
    return updated
