"""
Human Review Service.
Manages specialist triage queue and persists human-in-the-loop decisions in PostgreSQL.
Enforces the "NO SOURCE = NO VALUE" integrity rule.
"""

from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.entities import HumanReview, User
from ..schemas.review import (
    HumanReviewItemSchema,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
    ReviewAnnotatedToken,
    ReviewFeatureTag,
    ReviewBarrier,
    OpticalFeed
)
from ..schemas.common import SifPotentialLevel


class ReviewService:
    def _to_schema(self, rev: HumanReview) -> HumanReviewItemSchema:
        """
        Transforms persisted database record into response schema.
        Never fabricates tokens, barriers, LSRs, reporter, tags, or optical evidence.
        Strict rule: NO SOURCE = NO VALUE.
        """
        # 1. Annotated tokens strictly from database record
        tokens: List[ReviewAnnotatedToken] = []
        raw_tokens = getattr(rev, "annotated_tokens", None)
        if raw_tokens and isinstance(raw_tokens, list):
            for t in raw_tokens:
                if isinstance(t, dict):
                    wpct = None
                    if "weightPct" in t and t["weightPct"] is not None:
                        wpct = float(t["weightPct"])
                    elif "weight" in t and t["weight"] is not None:
                        wpct = float(t["weight"])
                    tokens.append(ReviewAnnotatedToken(
                        id=str(t.get("id", "")),
                        text=str(t.get("text", "")),
                        type=str(t["type"]) if t.get("type") is not None else None,
                        weightPct=wpct,
                        description=str(t["description"]) if t.get("description") is not None else None
                    ))

        # 2. Barriers strictly from database record
        barriers: List[ReviewBarrier] = []
        raw_barriers = getattr(rev, "barriers", None)
        if raw_barriers and isinstance(raw_barriers, list):
            for b in raw_barriers:
                if isinstance(b, dict):
                    barriers.append(ReviewBarrier(
                        id=str(b.get("id", "")),
                        code=str(b["code"]) if b.get("code") is not None else None,
                        name=str(b.get("name", "")),
                        description=str(b["description"]) if b.get("description") is not None else None,
                        status=str(b["status"]) if b.get("status") is not None else None
                    ))

        # 3. Feature tags strictly from database record
        feature_tags: List[ReviewFeatureTag] = []
        raw_tags = getattr(rev, "feature_tags", None)
        if raw_tags and isinstance(raw_tags, list):
            for ft in raw_tags:
                if isinstance(ft, dict):
                    w = float(ft["weight"]) if "weight" in ft and ft["weight"] is not None else None
                    feature_tags.append(ReviewFeatureTag(
                        name=str(ft.get("name", "")),
                        weight=w
                    ))

        # 4. SIF Potential Level - strictly known or None (NO default to MODERATE)
        sif_raw = (rev.ai_sif_level or "").strip().upper()
        sif_level: Optional[SifPotentialLevel] = None
        if "CRIT" in sif_raw:
            sif_level = SifPotentialLevel.CRITICAL
        elif "HIGH" in sif_raw:
            sif_level = SifPotentialLevel.HIGH
        elif "MOD" in sif_raw:
            sif_level = SifPotentialLevel.MODERATE
        elif "LOW" in sif_raw:
            sif_level = SifPotentialLevel.LOW
        else:
            sif_level = None

        # 5. AI SIF Score and Confidence - strictly None if not in database
        ai_sif_score = float(rev.ai_sif_score_pct) if rev.ai_sif_score_pct is not None else None
        ai_conf = float(rev.ai_confidence_pct) if rev.ai_confidence_pct is not None else None

        # 6. Optical Feed: ONLY if persisted and valid, no fake/stock photo fallbacks
        opt_feed = None
        if rev.optical_feed and isinstance(rev.optical_feed, dict):
            cam_id = rev.optical_feed.get("camId")
            img_url = rev.optical_feed.get("imageUrl")
            if cam_id and img_url and "unsplash.com" not in img_url:
                opt_feed = OpticalFeed(
                    camId=cam_id,
                    label=rev.optical_feed.get("label", ""),
                    timestamp=rev.optical_feed.get("timestamp", ""),
                    imageUrl=img_url,
                    aiMaskNotes=rev.optical_feed.get("aiMaskNotes", "")
                )

        # 7. Persisted governance decision - explicitly from review_decision column
        persisted_decision = getattr(rev, "review_decision", None)
        if not persisted_decision and rev.reviewer and rev.status in ["CERTIFIED", "COMMITTED", "RECLASSIFIED", "ESCALATED", "REJECTED"]:
            persisted_decision = "ACCEPT" if rev.status in ["CERTIFIED", "COMMITTED"] else rev.status

        return HumanReviewItemSchema(
            id=rev.id,
            incidentCode=rev.incident_code,
            siteName=rev.site_name,
            unit=rev.unit,
            eventTime=rev.event_time,
            reporter=getattr(rev, "reporter", None),
            vectorHash=None,  # No vector-hash source exists in the database: never fabricate one
            title=rev.title,
            narrative=rev.classification_rationale or None,
            annotatedTokens=tokens,
            aiSifLevel=sif_level,
            aiSifScorePct=ai_sif_score,
            aiConfidencePct=ai_conf,
            primaryLsr=getattr(rev, "primary_lsr", None),
            secondaryLsr=getattr(rev, "secondary_lsr", None),
            featureTags=feature_tags,
            barriers=barriers,
            specialistNotes=rev.reviewer_notes or None,
            status=rev.status,
            decision=persisted_decision,
            reviewerUserId=getattr(rev, "reviewer_user_id", None),
            verifiedBy=rev.reviewer,
            verifiedAt=rev.decided_at.strftime("%Y-%m-%d %H:%M UTC") if rev.decided_at else None,
            opticalFeed=opt_feed
        )

    def get_all(self, db: Session, status: Optional[str] = None) -> List[HumanReviewItemSchema]:
        query = db.query(HumanReview)
        if status and status != "all":
            query = query.filter(HumanReview.status.ilike(f"%{status}%"))

        items = query.order_by(HumanReview.created_at.desc()).all()
        return [self._to_schema(r) for r in items]

    def get_by_id(self, db: Session, review_id: str) -> Optional[HumanReviewItemSchema]:
        rev = db.query(HumanReview).filter(
            (HumanReview.id == review_id) | (HumanReview.incident_code == review_id)
        ).first()
        if not rev:
            return None
        return self._to_schema(rev)

    def record_decision(
        self,
        db: Session,
        review_id: str,
        payload: ReviewDecisionRequest,
        current_user: User
    ) -> Optional[ReviewDecisionResponse]:
        rev = db.query(HumanReview).filter(
            (HumanReview.id == review_id) | (HumanReview.incident_code == review_id)
        ).first()

        if not rev:
            return None

        # Authoritative identity strictly derived from authenticated session
        authoritative_name = (current_user.full_name or "").strip() or current_user.email
        now = datetime.now(timezone.utc)
        status_map = {
            "COMMITTED": "CERTIFIED",
            "ACCEPT": "CERTIFIED",
            "REJECTED": "REJECTED",
            "REJECT": "REJECTED",
            "ESCALATED": "ESCALATED",
            "ESCALATE": "ESCALATED",
            "RECLASSIFIED": "RECLASSIFIED",
            "RECLASSIFY": "RECLASSIFIED"
        }
        decision_map = {
            "COMMITTED": "COMMITTED",
            "ACCEPT": "COMMITTED",
            "REJECTED": "REJECTED",
            "REJECT": "REJECTED",
            "ESCALATED": "ESCALATED",
            "ESCALATE": "ESCALATED",
            "RECLASSIFIED": "RECLASSIFIED",
            "RECLASSIFY": "RECLASSIFIED"
        }
        dec = (payload.decision or "").strip().upper()
        if dec not in decision_map:
            # Never silently certify an unknown decision value.
            raise ValueError(
                f"Unsupported review decision '{payload.decision}'. "
                "Allowed: COMMITTED, ACCEPT, REJECTED, REJECT, ESCALATED, ESCALATE, RECLASSIFIED, RECLASSIFY."
            )
        if decision_map[dec] == "RECLASSIFIED" and payload.adjustedSifLevel is None and payload.adjustedSifScorePct is None:
            raise ValueError("A RECLASSIFIED decision requires an adjusted SIF level and/or adjusted SIF score.")

        # Preserve the original AI classification in the audit trail BEFORE any adjustment overwrites it.
        original_ai_level = rev.ai_sif_level
        original_ai_score = rev.ai_sif_score_pct
        adjusted_score_int = int(round(payload.adjustedSifScorePct)) if payload.adjustedSifScorePct is not None else None

        rev.review_decision = decision_map[dec]
        rev.status = status_map[dec]
        rev.reviewer_user_id = current_user.id
        rev.reviewer = authoritative_name
        rev.reviewer_notes = payload.specialistNotes or None
        rev.decided_at = now

        # Append authoritative governance decision to audit trail
        current_trail = list(rev.audit_trail) if isinstance(rev.audit_trail, list) else []
        current_trail.append({
            "action": "GOVERNANCE_DECISION",
            "decision": rev.review_decision,
            "status": rev.status,
            "reviewer_user_id": current_user.id,
            "reviewer_name": authoritative_name,
            "reviewer_email": current_user.email,
            "specialist_notes": rev.reviewer_notes,
            "timestamp": now.isoformat(),
            "original_ai_sif_level": original_ai_level,
            "original_ai_sif_score_pct": original_ai_score,
            "adjusted_sif_level": payload.adjustedSifLevel.value if payload.adjustedSifLevel else None,
            "adjusted_sif_score_pct": adjusted_score_int,
        })
        rev.audit_trail = current_trail

        if payload.adjustedSifLevel:
            rev.ai_sif_level = payload.adjustedSifLevel.value

        if adjusted_score_int is not None:
            rev.ai_sif_score_pct = adjusted_score_int

        db.commit()
        db.refresh(rev)

        schema_item = self._to_schema(rev)
        return ReviewDecisionResponse(
            id=rev.id,
            status=rev.status,
            decision=rev.review_decision,
            verifiedAt=now.strftime("%Y-%m-%d %H:%M UTC"),
            reviewerUserId=rev.reviewer_user_id,
            verifiedBy=rev.reviewer,
            specialistNotes=rev.reviewer_notes,
            item=schema_item
        )


review_service = ReviewService()
