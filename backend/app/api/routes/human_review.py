"""
Human Review API Routes.
Provides specialist review queue for AI-flagged SIF reports and logs human-in-the-loop decisions
persisted in PostgreSQL with authenticated operator attribution.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Path, Depends
from sqlalchemy.orm import Session

from ...schemas.review import (
    HumanReviewItemSchema,
    ReviewDecisionRequest,
    ReviewDecisionResponse
)
from ...services.review_service import review_service
from ...db.session import get_db
from ...models.entities import User
from ..deps import get_current_user

router = APIRouter(prefix="/reviews", tags=["Human-in-the-Loop Review"])


@router.get("", response_model=List[HumanReviewItemSchema], summary="List Human Review Queue Items")
def get_review_queue(
    status: Optional[str] = Query(None, description="Status filter (PENDING_REVIEW, CERTIFIED, REJECTED, ESCALATED, RECLASSIFIED)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[HumanReviewItemSchema]:
    """
    Returns items in the specialist triage queue queried from PostgreSQL.
    Requires authenticated operator session.
    """
    return review_service.get_all(db=db, status=status)


@router.get("/{review_id}", response_model=HumanReviewItemSchema, summary="Get Human Review Item by ID")
def get_review_item(
    review_id: str = Path(..., description="Review item ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> HumanReviewItemSchema:
    """
    Returns single review dossier with annotated tokens and optical verification feed from PostgreSQL.
    Requires authenticated operator session.
    """
    item = review_service.get_by_id(db=db, review_id=review_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Review item '{review_id}' not found.")
    return item


@router.post("/{review_id}/decision", response_model=ReviewDecisionResponse, summary="Submit Specialist Review Decision")
def submit_review_decision(
    review_id: str = Path(..., description="Review item ID"),
    payload: ReviewDecisionRequest = ...,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ReviewDecisionResponse:
    """
    Logs and persists specialist decision into PostgreSQL:
    - COMMITTED (CERTIFIED): Validates AI precursor calibration and commits to institutional memory
    - REJECT: Overrules false positive AI flag
    - ESCALATE: Sends to Corporate Process Safety Board
    - RECLASSIFY: Adjusts SIF potential level with justification notes

    Authoritative reviewer attribution is derived strictly from the authenticated operator session (current_user.id).
    """
    try:
        res = review_service.record_decision(
            db=db,
            review_id=review_id,
            payload=payload,
            current_user=current_user
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    if not res:
        raise HTTPException(status_code=404, detail=f"Review item '{review_id}' not found.")
    return res
