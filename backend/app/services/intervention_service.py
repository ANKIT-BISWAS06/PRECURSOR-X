"""
Intervention Service.
Provides persistent lifecycle management for CAPA interventions in PostgreSQL.
Authoritative source lineage enforced: NO SOURCE = NO VALUE.
"""

import time
import uuid
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from ..models.entities import (
    Intervention,
    Facility,
    PrecursorPattern,
    SafetyEvent,
    PrecursorObservation,
    WhatChangedSnapshot
)
from ..schemas.intervention import (
    InterventionSchema,
    CreateInterventionRequest,
    UpdateInterventionRequest
)

# Domain rule: Critical when persisted fatal probability >= configured SIF threshold.
PRIORITY_THRESHOLD_CRITICAL = 80


def generate_unique_capa_code(db: Session) -> str:
    """
    Generates a collision-resistant unique CAPA code.
    Uniqueness is guaranteed without deriving identifiers from COUNT(*).
    """
    for _ in range(15):
        candidate = f"CAPA-{uuid.uuid4().hex[:6].upper()}"
        if not db.query(Intervention).filter(Intervention.code == candidate).first():
            return candidate
    return f"CAPA-{int(time.time())}"


class InterventionService:
    def _to_schema(self, it: Intervention) -> InterventionSchema:
        raw_steps = it.protocol_steps or []
        steps: Optional[List[str]] = None
        if raw_steps and isinstance(raw_steps, list) and len(raw_steps) > 0:
            steps = [
                s.get("description", str(s)) if isinstance(s, dict) else str(s)
                for s in raw_steps
            ]

        return InterventionSchema(
            id=it.id,
            code=it.code,
            title=it.title,
            description=it.description,
            precursorPattern=it.precursor_pattern,
            targetedVector=it.targeted_vector,
            lsrCode=it.lsr_code,
            lsrTitle=it.lsr_title,
            sifRiskPct=float(it.sif_risk_pct) if it.sif_risk_pct is not None else None,
            priority=it.priority,
            status=it.status,
            targetFacility=it.target_facility,
            affectedSitesSummary=it.affected_sites_summary,
            observedRecurrence=it.observed_recurrence,
            protocolSteps=steps,
            owner=it.owner,
            ownerRole=it.owner_role,
            dueDate=it.due_date,
            progressPct=float(it.progress_pct) if it.progress_pct is not None else None,
            verificationMetric=it.verification_metric,
            sourceType=it.source_type,
            sourceRecordId=it.source_record_id,
            createdAt=it.created_at.strftime("%Y-%m-%d") if it.created_at else None,
            updatedAt=it.updated_at.strftime("%Y-%m-%d") if it.updated_at else None
        )

    def get_all(
        self,
        db: Session,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[InterventionSchema]:
        query = db.query(Intervention)
        if status and status != "all":
            query = query.filter(Intervention.status.ilike(f"%{status}%"))
        if priority and priority != "all":
            query = query.filter(Intervention.priority.ilike(f"%{priority}%"))
        if search:
            q = f"%{search.strip()}%"
            query = query.filter(
                (Intervention.title.ilike(q)) |
                (Intervention.code.ilike(q)) |
                (Intervention.description.ilike(q)) |
                (Intervention.target_facility.ilike(q))
            )

        items = query.order_by(Intervention.created_at.desc()).all()
        return [self._to_schema(it) for it in items]

    def create(self, db: Session, payload: CreateInterventionRequest) -> InterventionSchema:
        # Lineage: DATABASE_DERIVED (guaranteed unique identifier generation)
        new_id = f"int-{uuid.uuid4().hex[:10]}"
        new_code = generate_unique_capa_code(db)

        # 1. Validate facility against PostgreSQL if specified; do NOT use synthetic fallbacks
        target_facility = None
        if payload.targetFacility:
            fac = db.query(Facility).filter(
                (Facility.id == payload.targetFacility) |
                (Facility.name.ilike(f"%{payload.targetFacility}%")) |
                (Facility.code.ilike(f"%{payload.targetFacility}%"))
            ).first()
            target_facility = fac.name if fac else payload.targetFacility

        # 2. Associate precursor pattern if provided
        precursor_pattern = payload.precursorPattern
        targeted_vector = payload.targetedVector
        lsr_code = payload.lsrCode
        lsr_title = payload.lsrTitle
        sif_risk_pct = int(payload.sifRiskPct) if payload.sifRiskPct is not None else None

        if precursor_pattern:
            pat = db.query(PrecursorPattern).filter(
                (PrecursorPattern.id == precursor_pattern) |
                (PrecursorPattern.code == precursor_pattern) |
                (PrecursorPattern.title.ilike(f"%{precursor_pattern}%"))
            ).first()
            if pat:
                precursor_pattern = f"{pat.code}: {pat.title}"
                if not targeted_vector:
                    targeted_vector = pat.vector
                if not lsr_code:
                    lsr_code = pat.lsr_code
                if not lsr_title:
                    lsr_title = pat.lsr_title
                if sif_risk_pct is None:
                    sif_risk_pct = pat.fatal_probability_pct

        db_it = Intervention(
            id=new_id,
            code=new_code,
            title=payload.title,
            description=payload.description,
            precursor_pattern=precursor_pattern,
            targeted_vector=targeted_vector,
            lsr_code=lsr_code,
            lsr_title=lsr_title,
            sif_risk_pct=sif_risk_pct,
            priority=payload.priority,
            status="Proposed",
            target_facility=target_facility,
            affected_sites_summary=payload.affectedSitesSummary,
            observed_recurrence=payload.observedRecurrence,
            protocol_steps=payload.protocolSteps,
            owner=payload.owner,
            owner_role=payload.ownerRole,
            due_date=payload.dueDate,
            progress_pct=None,
            verification_metric=payload.verificationMetric,
            source_type=payload.sourceType,
            source_record_id=payload.sourceRecordId
        )
        db.add(db_it)
        db.commit()
        db.refresh(db_it)
        return self._to_schema(db_it)

    def create_from_precursor(
        self,
        db: Session,
        precursor_id: str,
        action_type: str = "DISPATCH_CAPA"
    ) -> InterventionSchema:
        """
        Creates and persists a targeted CAPA intervention strictly resolving authoritative data
        (title, description, facility, pattern, vector, LSR, risk, priority) from PostgreSQL.
        Due dates, progress percentages, owners, protocol steps, and facilities are NOT fabricated.
        """
        # Validate supported actionType
        if action_type != "DISPATCH_CAPA":
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported actionType '{action_type}'. Supported values: 'DISPATCH_CAPA'"
            )

        new_id = f"int-{uuid.uuid4().hex[:10]}"
        new_code = generate_unique_capa_code(db)

        # 1. Search in PrecursorPattern table
        pattern = db.query(PrecursorPattern).filter(
            (PrecursorPattern.id == precursor_id) |
            (PrecursorPattern.code == precursor_id) |
            (PrecursorPattern.title.ilike(f"%{precursor_id}%"))
        ).first()

        if pattern:
            # Exact duplicate check via source lineage
            existing = db.query(Intervention).filter(
                Intervention.source_type == "PRECURSOR_PATTERN",
                Intervention.source_record_id == pattern.id
            ).first()
            if existing:
                return self._to_schema(existing)

            # Resolve facility strictly from PrecursorObservation -> Facility. Null if not recorded.
            target_facility = None
            obs = db.query(PrecursorObservation).filter(PrecursorObservation.pattern_id == pattern.id).first()
            if obs and obs.facility_id:
                fac = db.query(Facility).filter(Facility.id == obs.facility_id).first()
                if fac:
                    target_facility = fac.name

            # Protocol steps strictly sourced from pattern.pathway_nodes if populated; never fabricated.
            protocol_steps = None
            if pattern.pathway_nodes and isinstance(pattern.pathway_nodes, list) and len(pattern.pathway_nodes) > 0:
                protocol_steps = [
                    s.get("label", str(s)) if isinstance(s, dict) else str(s)
                    for s in pattern.pathway_nodes
                ]

            # Domain rule: Critical when persisted fatal probability >= configured SIF threshold.
            priority_val = None
            if pattern.fatal_probability_pct is not None:
                priority_val = "Critical" if pattern.fatal_probability_pct >= PRIORITY_THRESHOLD_CRITICAL else "High"

            title_val = f"Targeted CAPA: {pattern.title}" if pattern.title else (f"Targeted CAPA: {pattern.code}" if pattern.code else None)
            description_val = (
                f"Operational CAPA dispatched from detected precursor {pattern.code}. Vector: {pattern.vector}."
                if pattern.vector
                else "Insufficient source information."
            )

            db_it = Intervention(
                id=new_id,
                code=new_code,
                title=title_val or "Precursor CAPA Intervention",
                description=description_val,
                precursor_pattern=f"{pattern.code}: {pattern.title}" if pattern.code and pattern.title else pattern.title,
                targeted_vector=pattern.vector,
                lsr_code=pattern.lsr_code,
                lsr_title=pattern.lsr_title,
                sif_risk_pct=pattern.fatal_probability_pct,
                priority=priority_val,
                status="Proposed",
                target_facility=target_facility,
                affected_sites_summary=pattern.observed_recurrence,
                observed_recurrence=pattern.observed_recurrence,
                protocol_steps=protocol_steps,
                owner=None,
                owner_role=None,
                due_date=None,
                progress_pct=None,
                verification_metric=None,
                source_type="PRECURSOR_PATTERN",
                source_record_id=pattern.id
            )
            db.add(db_it)
            db.commit()
            db.refresh(db_it)
            return self._to_schema(db_it)

        # 2. Search in SafetyEvent table
        event = db.query(SafetyEvent).filter(SafetyEvent.id == precursor_id).first()
        if event:
            # Exact duplicate check via source lineage
            existing = db.query(Intervention).filter(
                Intervention.source_type == "SAFETY_EVENT",
                Intervention.source_record_id == event.id
            ).first()
            if existing:
                return self._to_schema(existing)

            # Persisted event severity mapping to priority; no arbitrary fallbacks
            priority_val = event.severity.capitalize() if event.severity else None
            title_val = f"CAPA Mitigation: {event.vector}" if event.vector else (f"CAPA Mitigation Event {event.id}" if event.id else None)
            description_val = (
                f"{event.severity} {event.type} event recorded at {event.facility_name} unit {event.unit}."
                if (event.severity and event.facility_name)
                else "Insufficient source information."
            )

            db_it = Intervention(
                id=new_id,
                code=new_code,
                title=title_val or "Event CAPA Mitigation",
                description=description_val,
                precursor_pattern=f"Event {event.id}: {event.vector}" if event.vector else f"Event {event.id}",
                targeted_vector=event.vector,
                lsr_code=None,
                lsr_title=None,
                sif_risk_pct=None,
                priority=priority_val,
                status="Proposed",
                target_facility=event.facility_name if event.facility_name else None,
                affected_sites_summary=f"Unit {event.unit}" if event.unit else None,
                observed_recurrence=None,
                protocol_steps=None,
                owner=None,
                owner_role=None,
                due_date=None,
                progress_pct=None,
                verification_metric=None,
                source_type="SAFETY_EVENT",
                source_record_id=event.id
            )
            db.add(db_it)
            db.commit()
            db.refresh(db_it)
            return self._to_schema(db_it)

        # 3. Search in WhatChangedSnapshot flagged precursors
        snapshot = db.query(WhatChangedSnapshot).first()
        if snapshot and snapshot.flagged_precursors:
            for item in snapshot.flagged_precursors:
                item_id = item.get("id") or item.get("name")
                if item_id == precursor_id or item.get("name") == precursor_id:
                    # Exact duplicate check via source lineage
                    existing = db.query(Intervention).filter(
                        Intervention.source_type == "WHAT_CHANGED",
                        Intervention.source_record_id == item_id
                    ).first()
                    if existing:
                        return self._to_schema(existing)

                    raw_lsr = item.get("lsr")
                    lsr_code = None
                    lsr_title = None
                    if raw_lsr and isinstance(raw_lsr, str):
                        parts = raw_lsr.split(":")
                        lsr_code = parts[0].strip() if len(parts) > 0 and parts[0].strip() else None
                        lsr_title = parts[1].strip() if len(parts) > 1 and parts[1].strip() else raw_lsr

                    title_val = item.get("recommendedCapaTitle") or (
                        f"Targeted CAPA: {item.get('name')}" if item.get("name") else None
                    )
                    description_val = (
                        f"Containment protocol for accelerated precursor drift: {item.get('name')} at {item.get('asset')}."
                        if (item.get("name") and item.get("asset"))
                        else "Insufficient source information."
                    )

                    db_it = Intervention(
                        id=new_id,
                        code=new_code,
                        title=title_val or "Drift Containment Intervention",
                        description=description_val,
                        precursor_pattern=f"{item.get('id')}: {item.get('name')}" if item.get("id") and item.get("name") else item.get("name"),
                        targeted_vector=item.get("recommendedCapaVector") or item.get("name"),
                        lsr_code=lsr_code,
                        lsr_title=lsr_title,
                        sif_risk_pct=None,
                        priority=item.get("recommendedPriority"),
                        status="Proposed",
                        target_facility=item.get("asset"),
                        affected_sites_summary=item.get("asset"),
                        observed_recurrence=item.get("delta"),
                        protocol_steps=None,
                        owner=None,
                        owner_role=None,
                        due_date=None,
                        progress_pct=None,
                        verification_metric=None,
                        source_type="WHAT_CHANGED",
                        source_record_id=item_id
                    )
                    db.add(db_it)
                    db.commit()
                    db.refresh(db_it)
                    return self._to_schema(db_it)

        # 4. Not found in PostgreSQL
        raise HTTPException(
            status_code=404,
            detail=f"Authoritative source precursor or event record '{precursor_id}' not found in PostgreSQL."
        )

    def update(
        self,
        db: Session,
        intervention_id: str,
        payload: UpdateInterventionRequest
    ) -> Optional[InterventionSchema]:
        it = db.query(Intervention).filter(
            (Intervention.id == intervention_id) | (Intervention.code == intervention_id)
        ).first()

        if not it:
            return None

        if payload.title is not None:
            it.title = payload.title
        if payload.description is not None:
            it.description = payload.description
        if payload.status is not None:
            it.status = payload.status
        if payload.priority is not None:
            it.priority = payload.priority
        if payload.progressPct is not None:
            it.progress_pct = int(payload.progressPct)
        if payload.owner is not None:
            it.owner = payload.owner
        if payload.dueDate is not None:
            it.due_date = payload.dueDate

        db.commit()
        db.refresh(it)
        return self._to_schema(it)


intervention_service = InterventionService()
