"""
Safety Memory Service.
Provides institutional memory search and precedent retrieval across past incidents and near misses
queried directly from PostgreSQL safety_memory table.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.entities import SafetyMemoryRecord
from ..schemas.memory import SafetyMemoryItemSchema, SafetyMemorySearchResponse
from ..schemas.common import SifPotentialLevel


class MemoryService:
    def search_memory(
        self,
        db: Session,
        query: Optional[str] = "",
        mode: Optional[str] = "keyword",
        facility: Optional[str] = "all",
        severity: Optional[str] = "all",
        category: Optional[str] = "all"
    ) -> SafetyMemorySearchResponse:
        total_records = db.query(SafetyMemoryRecord).count()

        db_query = db.query(SafetyMemoryRecord)

        if facility and facility != "all":
            db_query = db_query.filter(SafetyMemoryRecord.facility.ilike(f"%{facility}%"))

        if severity and severity != "all":
            db_query = db_query.filter(SafetyMemoryRecord.consequence_tier.ilike(f"%{severity}%"))

        if category and category != "all":
            db_query = db_query.filter(SafetyMemoryRecord.lsr_violated.ilike(f"%{category}%"))

        q = (query or "").strip().lower()
        if q:
            tokens = [tok for tok in q.split() if len(tok) >= 2]
            if tokens:
                from sqlalchemy import or_
                conditions = []
                for tok in tokens:
                    pat = f"%{tok}%"
                    conditions.extend([
                        SafetyMemoryRecord.title.ilike(pat),
                        SafetyMemoryRecord.operational_context.ilike(pat),
                        SafetyMemoryRecord.precursor_signature.ilike(pat),
                        SafetyMemoryRecord.facility.ilike(pat),
                        SafetyMemoryRecord.precedent_code.ilike(pat),
                        SafetyMemoryRecord.lsr_violated.ilike(pat)
                    ])
                db_query = db_query.filter(or_(*conditions))

        items = db_query.all()
        results: List[SafetyMemoryItemSchema] = []

        for item in items:
            sif_level = (
                SifPotentialLevel.CRITICAL if "critical" in item.consequence_tier.lower()
                else SifPotentialLevel.HIGH if "high" in item.consequence_tier.lower()
                else SifPotentialLevel.MODERATE
            )

            # Deterministic keyword token overlap score (DATABASE_DERIVED)
            target_text = f"{item.title} {item.operational_context} {item.precursor_signature or ''} {item.lsr_violated}".lower()
            if q:
                tokens = [tok for tok in q.split() if len(tok) >= 2]
                count_matches = sum(1 for tok in tokens if tok in target_text)
                score = round((count_matches / max(1, len(tokens))) * 100.0, 1)
            else:
                score = 100.0

            broken_barrier = item.failed_barriers[0] if (item.failed_barriers and len(item.failed_barriers) > 0) else "Not recorded"
            lessons_learned = item.corrective_actions[0] if (item.corrective_actions and len(item.corrective_actions) > 0) else "Not recorded"

            results.append(
                SafetyMemoryItemSchema(
                    id=item.id,
                    code=item.precedent_code,
                    title=item.title,
                    facility=item.facility,
                    year=item.year,
                    date=str(item.year) if item.year else None,
                    category=item.lsr_violated,
                    governingLsr=item.lsr_violated,
                    sifPotential=sif_level,
                    sifClassification=item.consequence_tier,
                    matchScore=score,
                    precursorSignature=item.precursor_signature,
                    narrative=item.operational_context,
                    brokenBarrier=broken_barrier,
                    lessonsLearned=lessons_learned,
                    extractedPrecursors=[item.precursor_signature] if item.precursor_signature else []
                )
            )

        return SafetyMemorySearchResponse(
            query=query or "",
            mode=mode or "keyword",
            totalRecords=total_records,
            totalMatches=len(results),
            matchesCount=len(results),
            results=results
        )


memory_service = MemoryService()
