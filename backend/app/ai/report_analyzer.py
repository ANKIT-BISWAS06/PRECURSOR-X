import time
import uuid
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from .groq_client import GroqClient, GroqAPIError, GroqConfigurationError
from ..schemas.report_analysis import StructuredReportAnalysis
from ..models.entities import Facility, SafetyReport, SafetyEvent, SafetyRule, PrecursorPattern, KnowledgeGraphNode, HumanReview
from ..core.config import settings

logger = logging.getLogger("precursor_x.ai.analyzer")


async def analyze_safety_report_with_groq(
    text: str,
    context: Optional[Dict[str, Any]] = None,
    db: Optional[Session] = None
) -> StructuredReportAnalysis:
    """
    Authoritative Report Analyzer powered by Groq Cloud AI.
    Grounds AI analysis strictly in domain context retrieved from PostgreSQL.
    Validates output with Pydantic and against PostgreSQL records.
    Measures processing time using monotonic time.perf_counter().
    """
    context = context or {}

    # 1. Retrieve domain grounding context from PostgreSQL
    known_rules: List[str] = []
    known_patterns: List[str] = []
    known_barriers: List[str] = []

    if db:
        try:
            rules = db.query(SafetyRule).limit(10).all()
            known_rules = [f"{r.code}: {r.name} ({r.standards_ref})" for r in rules]

            patterns = db.query(PrecursorPattern).limit(8).all()
            known_patterns = [f"{p.code}: {p.title} [Vector: {p.vector}]" for p in patterns]

            barriers = db.query(KnowledgeGraphNode).filter(KnowledgeGraphNode.type == "barrier").limit(10).all()
            known_barriers = [f"{b.label} ({b.category})" for b in barriers]
        except Exception as e:
            logger.warning(f"Could not load domain grounding context from database: {e}")

    # 2. Build domain grounding prompt strictly without fabricated defaults
    rules_text = "; ".join(known_rules) if known_rules else "No domain records available in database."
    patterns_text = "; ".join(known_patterns) if known_patterns else "No domain records available in database."
    barriers_text = "; ".join(known_barriers) if known_barriers else "No domain records available in database."

    system_prompt = (
        "You are the PRECURSOR-X Industrial Safety & SIF (Significant Injury & Fatality) Intelligence AI. "
        "Analyze the provided field safety narrative or incident report text with extreme rigor according to CCPS process safety "
        "and IOGP Life-Saving Rules standards.\n\n"
        "DATABASE KNOWLEDGE GROUNDING:\n"
        f"- Official Life-Saving Rules in Database: {rules_text}\n"
        f"- Known Precursor Pattern Genomes in Database: {patterns_text}\n"
        f"- Recognized CCPS Barriers: {barriers_text}\n\n"
        "OUTPUT REQUIREMENT: Return ONLY a valid JSON object matching this exact structure without markdown backticks:\n"
        "{\n"
        '  "sifPotential": "CRITICAL" | "HIGH" | "MODERATE" | "LOW",\n'
        '  "sifScorePct": <integer 0-100>,\n'
        '  "confidencePct": <integer 0-100>,\n'
        '  "title": "<Concise incident title>",\n'
        '  "explanation": "<Deep technical narrative on why this is or is not a SIF precursor>",\n'
        '  "hazards": [\n'
        '    {"name": "<Hazard name>", "threshold": "<Concentration/Pressure/Energy value>", "level": "critical"|"high"|"moderate"}\n'
        "  ],\n"
        '  "precursors": [\n'
        '    {"name": "<Precursor description>", "evidence": "<Direct excerpt from text>", "weight": <1-100>, "pattern_id": "<Matching pattern code if applicable or null>"}\n'
        "  ],\n"
        '  "consequences": [\n'
        '    {"title": "<Potential consequence>", "severity": "<Severity level>", "regulatoryTier": "<e.g. OSHA Severe / CCPS Tier 1>"}\n'
        "  ],\n"
        '  "lifeSavingRule": {\n'
        '    "code": "<e.g. LSR-04>",\n'
        '    "name": "<Rule name>",\n'
        '    "standardsRef": "<e.g. IOGP 459 Standard 4 / OSHA 1910.146>"\n'
        "  },\n"
        '  "secondaryLsr": "<Optional secondary rule>",\n'
        '  "barrierFailures": [\n'
        '    {"id": "<barrier_id>", "name": "<Barrier name>", "description": "<Specific breach>", "status": "FAILED"|"BYPASSED"|"EFFECTIVE"|"STANDBY"}\n'
        "  ],\n"
        '  "mitigatingControls": [\n'
        '    {"name": "<Mitigation name>", "status": "EFFECTIVE"|"STANDBY"|"FAILED", "description": "<Action taken>"}\n'
        "  ],\n"
        '  "annotatedTokens": [\n'
        '    {"id": "<tok-id>", "text": "<Exact phrase from text>", "type": "critical-precursor"|"barrier-breach"|"mitigating-action"|"asset-tag", "description": "<Why flagged>"}\n'
        "  ],\n"
        '  "tokensDetectedCount": <integer count of annotated tokens>\n'
        "}"
    )

    user_prompt = f"INCIDENT REPORT NARRATIVE:\n{text}\n"
    if context.get("unit"):
        user_prompt += f"OPERATING UNIT: {context['unit']}\n"
    if context.get("category"):
        user_prompt += f"REPORT CATEGORY: {context['category']}\n"

    # 3. Call Groq AI client and measure actual latency with monotonic timer
    client = GroqClient()
    perf_start = time.perf_counter()

    try:
        raw_json = await client.chat_completion_json(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1
        )
    except (GroqConfigurationError, GroqAPIError) as e:
        logger.error(f"Groq AI invocation failed: {e}")
        raise

    # 4. Strict Pydantic validation
    try:
        if "tokensDetectedCount" not in raw_json or not raw_json["tokensDetectedCount"]:
            raw_json["tokensDetectedCount"] = len(raw_json.get("annotatedTokens", []))
        validated_analysis = StructuredReportAnalysis(**raw_json)
    except Exception as ve:
        logger.error(f"Failed to validate Groq AI output against schema: {ve}")
        raise GroqAPIError(f"Groq AI returned schema mismatch: {str(ve)}")

    perf_end = time.perf_counter()
    duration_ms = max(1, int((perf_end - perf_start) * 1000))
    validated_analysis.processingTimeMs = duration_ms
    validated_analysis.ai_model = settings.GROQ_MODEL if settings.GROQ_MODEL else "Groq AI"
    validated_analysis.source = "AI INFERENCE"

    # 5. Strict database validation against PostgreSQL
    if db:
        try:
            # Validate precursor pattern IDs
            db_patterns = db.query(PrecursorPattern).all()
            valid_pattern_ids = {p.id for p in db_patterns}
            valid_pattern_codes = {p.code for p in db_patterns}
            for prec in validated_analysis.precursors:
                if prec.pattern_id and prec.pattern_id not in valid_pattern_ids and prec.pattern_id not in valid_pattern_codes:
                    prec.pattern_id = None

            # Validate LSR codes
            db_rules = db.query(SafetyRule).all()
            valid_lsr_codes = {r.code for r in db_rules}
            if validated_analysis.lifeSavingRule and validated_analysis.lifeSavingRule.code:
                if validated_analysis.lifeSavingRule.code not in valid_lsr_codes:
                    validated_analysis.lifeSavingRule.code = None

            # Validate barrier IDs
            db_barriers = db.query(KnowledgeGraphNode).filter(KnowledgeGraphNode.type == "barrier").all()
            valid_barrier_ids = {b.node_id for b in db_barriers} | {b.id for b in db_barriers}
            for barrier in validated_analysis.barrierFailures:
                if barrier.id and barrier.id not in valid_barrier_ids:
                    barrier.id = None
        except Exception as pve:
            logger.warning(f"Could not complete strict database validation: {pve}")

    # 6. Persist Report & Analysis in PostgreSQL
    if db:
        try:
            now_dt = datetime.now(timezone.utc)
            # Collision-resistant identifier (millisecond clock ids could repeat and violate unique incident codes)
            report_id = f"rep-{uuid.uuid4().hex[:12]}"

            # Resolve facility strictly from validated PostgreSQL records
            validated_facility = None
            candidate_fac_id = context.get("facility_id") or context.get("siteId")
            candidate_unit = context.get("unit") or context.get("siteName")

            if candidate_fac_id:
                validated_facility = db.query(Facility).filter(Facility.id == candidate_fac_id).first()
            if not validated_facility and candidate_unit:
                validated_facility = db.query(Facility).filter(
                    (Facility.name.ilike(f"%{candidate_unit}%")) |
                    (Facility.code.ilike(f"%{candidate_unit}%"))
                ).first()

            validated_analysis.report_id = report_id

            db_report = SafetyReport(
                id=report_id,
                text=text,
                unit=context.get("unit"),
                category=context.get("category"),
                status="ANALYZED",
                sif_potential=validated_analysis.sifPotential,
                sif_score=validated_analysis.sifScorePct,
                confidence=validated_analysis.confidencePct,
                ai_model=validated_analysis.ai_model,
                processing_duration_ms=duration_ms,
                analysis_result=validated_analysis.model_dump(),
                created_at=now_dt
            )
            db.add(db_report)

            # Flow: Report -> Groq -> StructuredReportAnalysis -> PostgreSQL -> Human Review
            if validated_analysis.sifPotential in ["CRITICAL", "HIGH"]:
                hr_id = f"rev-{report_id}"
                validated_analysis.review_id = hr_id
                db_review = HumanReview(
                    id=hr_id,
                    incident_code=f"IR-{now_dt.strftime('%Y')}-{report_id[-8:].upper()}",
                    title=validated_analysis.title,
                    site_name=validated_facility.name if validated_facility else (context.get("unit") or None),
                    unit=context.get("unit") or (validated_facility.name if validated_facility else None),
                    event_time=now_dt.strftime("%Y-%m-%d %H:%M UTC"),
                    status="PENDING_REVIEW",
                    ai_sif_level=validated_analysis.sifPotential,
                    ai_sif_score_pct=validated_analysis.sifScorePct,
                    ai_confidence_pct=validated_analysis.confidencePct,
                    optical_feed=None,  # No fake optical feed
                    classification_rationale=validated_analysis.explanation,
                    specialist_calibration=None,
                    audit_trail=[{"action": "QUEUED_FROM_ANALYZER", "timestamp": now_dt.isoformat()}],
                    reporter=context.get("reporter"),
                    primary_lsr=f"{validated_analysis.lifeSavingRule.code}: {validated_analysis.lifeSavingRule.name}" if validated_analysis.lifeSavingRule and validated_analysis.lifeSavingRule.code else (validated_analysis.lifeSavingRule.name if validated_analysis.lifeSavingRule else None),
                    secondary_lsr=validated_analysis.secondaryLsr,
                    annotated_tokens=[t.model_dump() for t in validated_analysis.annotatedTokens] if validated_analysis.annotatedTokens else [],
                    feature_tags=[{"name": p.name, "weight": p.weight / 100.0} for p in validated_analysis.precursors] if validated_analysis.precursors else [],
                    barriers=[b.model_dump() for b in validated_analysis.barrierFailures] if validated_analysis.barrierFailures else [],
                    reviewer=None,
                    reviewer_notes=None,
                    decided_at=None,
                    created_at=now_dt
                )
                db.add(db_review)

            # Only create an operational SafetyEvent when there is sufficient legitimate context:
            # Requires a validated PostgreSQL facility AND legitimate event evidence
            event_time_candidate = context.get("event_time") or context.get("eventTime") or context.get("timestamp")
            has_event_context = bool(validated_facility and (event_time_candidate or context.get("unit")))

            if validated_facility and has_event_context and validated_analysis.sifPotential in ["CRITICAL", "HIGH"]:
                event_time_str = event_time_candidate if event_time_candidate else now_dt.strftime("%Y-%m-%d %H:%M:%S UTC")
                db_event = SafetyEvent(
                    id=f"evt-{report_id}",
                    facility_id=validated_facility.id,
                    facility_name=validated_facility.name,
                    unit=context.get("unit", validated_facility.name),
                    time=event_time_str,
                    type="AI Precursor Extraction",
                    severity=validated_analysis.sifPotential,
                    vector=validated_analysis.title,
                    consequence=4 if validated_analysis.sifPotential == "CRITICAL" else 3,
                    frequency=3
                )
                db.add(db_event)

            db.commit()
            logger.info(f"Persisted AI analyzed report {report_id} to PostgreSQL database.")
        except Exception as dbe:
            db.rollback()
            logger.error(f"Failed to persist analyzed report to database: {dbe}")
            # The analysis is a genuine Groq result, but it was NOT saved: do not return identifiers that
            # point at records which do not exist in PostgreSQL.
            validated_analysis.report_id = None
            validated_analysis.review_id = None

    return validated_analysis
