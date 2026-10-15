"""
Report Analyzer API Route.
Receives raw unstructured incident or near-miss narratives and returns structured Groq AI precursor diagnostics.
Provides governance persistence endpoints to record human decisions into PostgreSQL with authenticated operator attribution.
"""

import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...schemas.report import AnalyzeReportRequest
from ...schemas.report_analysis import StructuredReportAnalysis
from ...services.report_service import report_service
from ...models.entities import SafetyReport, HumanReview, User
from ...db.session import get_db
from ...ai.groq_client import GroqConfigurationError, GroqAPIError
from ..deps import get_current_user

logger = logging.getLogger("precursor_x.reports")
router = APIRouter(prefix="/reports", tags=["Report Analyzer"])


class GovernanceCommitRequest(BaseModel):
    report_id: Optional[str] = None
    review_id: Optional[str] = None
    decision: str = Field(..., description="'COMMITTED', 'RECLASSIFIED', 'ESCALATED' or 'REJECTED'")
    # NOTE: no reviewer field. Reviewer identity is always derived from the authenticated PostgreSQL user.
    notes: Optional[str] = ""
    adjustedSifLevel: Optional[str] = None


class GovernanceCommitResponse(BaseModel):
    success: bool
    status: str
    decision: str
    reviewer: str
    persistedAt: str
    message: str


@router.post("/analyze", response_model=StructuredReportAnalysis, summary="Analyze Safety Narrative for SIF Precursors with Groq AI")
async def analyze_report(
    payload: AnalyzeReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> StructuredReportAnalysis:
    """
    Analyzes unstructured safety text using Groq Cloud AI:
    - SIF potential classification & calibrated confidence
    - Governing Life-Saving Rules grounded in PostgreSQL
    - Precursor and hazard vectors matched with known patterns
    - Barrier failures and mitigating Stop Work Authority interventions
    - Annotated entity tokens (asset tags, precursors, barrier breaches)
    - Persists the report and AI analysis into PostgreSQL

    Requires authenticated operator session.
    """
    try:
        return await report_service.analyze_report(payload.text, payload.context, db)
    except GroqConfigurationError as gce:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI ANALYSIS UNAVAILABLE: {str(gce)}"
        )
    except GroqAPIError as gae:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI ANALYSIS UNAVAILABLE: {str(gae)}"
        )
    except Exception:
        logger.exception("Unexpected report analysis failure")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI ANALYSIS UNAVAILABLE: Unexpected analysis failure. See server logs."
        )


@router.post("/governance", response_model=GovernanceCommitResponse, summary="Persist Human Governance Decision for Analyzed Report")
def record_report_governance(
    payload: GovernanceCommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> GovernanceCommitResponse:
    """
    Persists human governance actions (commit/reclassify/escalate) into PostgreSQL.
    Derives reviewer identity authoritatively from the authenticated operator session.
    """
    # Authoritative reviewer identity from authenticated user
    recorded_reviewer = (current_user.full_name or "").strip() or current_user.email

    now = datetime.now(timezone.utc)
    decision_clean = (payload.decision or "").strip().upper()
    status_map = {
        "COMMITTED": "COMMITTED",
        "ACCEPT": "COMMITTED",
        "RECLASSIFIED": "RECLASSIFIED",
        "ESCALATED": "ESCALATED",
        "REJECTED": "REJECTED"
    }
    if decision_clean not in status_map:
        # Never silently commit an unknown decision value.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported governance decision '{payload.decision}'. "
                   "Allowed: COMMITTED, ACCEPT, RECLASSIFIED, ESCALATED, REJECTED."
        )
    resolved_status = status_map[decision_clean]

    # 1. Update SafetyReport in PostgreSQL if report_id provided
    if payload.report_id:
        db_rep = db.query(SafetyReport).filter(SafetyReport.id == payload.report_id).first()
        if db_rep:
            db_rep.status = resolved_status
            if payload.adjustedSifLevel:
                db_rep.sif_potential = payload.adjustedSifLevel

    # 2. Update HumanReview in PostgreSQL if review_id provided or linked
    hr = None
    if payload.review_id:
        hr = db.query(HumanReview).filter(
            (HumanReview.id == payload.review_id) | (HumanReview.incident_code == payload.review_id)
        ).first()
    elif payload.report_id:
        hr = db.query(HumanReview).filter(
            (HumanReview.id == f"rev-{payload.report_id}") | (HumanReview.id.ilike(f"%{payload.report_id}%"))
        ).first()

    if hr:
        hr.review_decision = "COMMITTED" if resolved_status == "COMMITTED" else decision_clean
        hr.status = "CERTIFIED" if resolved_status == "COMMITTED" else resolved_status
        hr.reviewer_user_id = current_user.id
        hr.reviewer = recorded_reviewer
        hr.reviewer_notes = payload.notes or None
        hr.decided_at = now

        current_trail = list(hr.audit_trail) if isinstance(hr.audit_trail, list) else []
        current_trail.append({
            "action": "GOVERNANCE_COMMIT",
            "decision": decision_clean,
            "status": hr.status,
            "reviewer_user_id": current_user.id,
            "reviewer_name": recorded_reviewer,
            "reviewer_email": current_user.email,
            "notes": hr.reviewer_notes,
            "timestamp": now.isoformat(),
            "adjusted_sif_level": payload.adjustedSifLevel
        })
        hr.audit_trail = current_trail

        if payload.adjustedSifLevel:
            hr.ai_sif_level = payload.adjustedSifLevel

    db.commit()

    return GovernanceCommitResponse(
        success=True,
        status=resolved_status,
        decision=decision_clean,
        reviewer=recorded_reviewer,
        persistedAt=now.strftime("%Y-%m-%d %H:%M UTC"),
        message=f"Governance decision '{decision_clean}' persisted into PostgreSQL by {recorded_reviewer}."
    )
