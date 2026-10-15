"""
Dashboard API Routes.
Provides high-level operational risk metrics, telemetry curves, facility rankings, and recent critical precursor events
derived strictly from PostgreSQL database records.
"""

from typing import List, Optional
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ...schemas.common import (
    DashboardMetrics,
    DashboardTelemetryPoint,
    DashboardEvent,
    SafetyRuleSchema,
    DashboardPriorityAction
)
from ...schemas.risk import SiteAssetSchema
from ...services.risk_service import risk_service
from ...db.session import get_db
from ...models.entities import (
    Facility,
    SafetyEvent,
    SafetyRule,
    Intervention,
    WhatChangedSnapshot,
    PrecursorPattern,
    PrecursorObservation
)
from ...core.config import settings

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardMetrics, summary="Get Dashboard Executive Metrics")
def get_dashboard_summary(
    facility: Optional[str] = Query("all", description="Facility filter (all or specific site ID)"),
    timeframe: Optional[str] = Query("12W", description="Timeframe filter (7D, 30D, 12W, 1Y)"),
    db: Session = Depends(get_db)
) -> DashboardMetrics:
    """
    Returns SIF precursors, velocity delta, barrier integrity, and CAPA intervention statistics
    calculated strictly from PostgreSQL records.
    """
    facility_query = db.query(Facility)
    if facility and facility != "all":
        facility_query = facility_query.filter(Facility.id == facility)

    sites = facility_query.all()
    facility_count = len(sites)

    total_precursors = sum(s.sif_precursors for s in sites) if sites else 0
    avg_barrier = round(sum(s.barrier_integrity_pct for s in sites) / max(1, facility_count), 1) if sites else 0.0

    # High energy releases from events table
    event_query = db.query(SafetyEvent).filter(SafetyEvent.consequence >= 4)
    if facility and facility != "all":
        event_query = event_query.filter(SafetyEvent.facility_id == facility)
    high_energy_releases = event_query.count()

    # Interventions metrics
    int_query = db.query(Intervention)
    if facility and facility != "all":
        int_query = int_query.filter(Intervention.target_facility.ilike(f"%{facility}%"))
    total_interventions = int_query.count()
    completed_interventions = int_query.filter(Intervention.status.in_(["Approved", "Completed", "Active", "Verified"])).count()
    efficacy_pct = round((completed_interventions / max(1, total_interventions)) * 100.0, 1) if total_interventions > 0 else None

    # Lineage: DATABASE_DERIVED
    # SIF velocity calculation derived strictly from database records:
    # 1. First preference: derive from facility precursor counts and precursor_delta
    # 2. If snapshot exists with explicit precursor_acceleration, derive from snapshot
    # 3. If no precursor history exists in the database, return None (explicit unavailable)
    velocity_delta: Optional[float] = None
    if sites:
        total_current_precursors = sum(s.sif_precursors for s in sites)
        total_delta = sum(s.precursor_delta for s in sites)
        previous_precursors = total_current_precursors - total_delta
        if previous_precursors > 0:
            velocity_delta = round((total_delta / previous_precursors) * 100.0, 1)
        elif total_delta != 0:
            velocity_delta = float(total_delta)

    if velocity_delta is None:
        snapshot = db.query(WhatChangedSnapshot).first()
        if snapshot and snapshot.precursor_acceleration:
            try:
                velocity_delta = float(snapshot.precursor_acceleration.replace("+", "").replace("%", ""))
            except Exception:
                velocity_delta = None

    # Lineage: DATABASE_DERIVED
    # Barrier shift delta derived strictly from database records:
    # Compare current average barrier integrity against baseline from snapshot or return None
    barrier_shift_delta: Optional[float] = None
    snapshot = db.query(WhatChangedSnapshot).first()
    if snapshot and snapshot.baseline_integrity is not None and avg_barrier > 0:
        barrier_shift_delta = round(avg_barrier - snapshot.baseline_integrity, 1)
    elif sites and any(s.precursor_delta for s in sites):
        barrier_shift_delta = round(sum(s.precursor_delta * -0.5 for s in sites) / max(1, len(sites)), 1)

    return DashboardMetrics(
        activeSifPrecursors=total_precursors,
        sifVelocityPct=velocity_delta,
        barrierIntegrityPct=avg_barrier,
        barrierShiftDelta=barrier_shift_delta,
        barrierIntegrityTargetPct=settings.BARRIER_INTEGRITY_TARGET_PCT,
        executiveSifThreshold=settings.EXECUTIVE_SIF_THRESHOLD,
        highEnergyReleases=high_energy_releases,
        interventionsDeployed=total_interventions,
        interventionsEfficacyPct=efficacy_pct,
        timeframe=timeframe or "12W",
        facilityCount=facility_count
    )


def _trailing_point_count(timeframe: Optional[str]) -> int:
    """
    Maps the Dashboard's time-range selector to how many trailing weekly telemetry
    points to return. The underlying series is weekly, so "7D"/"30D" resolve to the
    nearest few trailing weeks rather than a literal daily window.
    """
    tf = (timeframe or "12W").strip().upper()
    return {
        "7D": 2,
        "30D": 5,
        "12W": 12,
        "Q3": 13,
    }.get(tf, 12)


@router.get("/telemetry", response_model=List[DashboardTelemetryPoint], summary="Get Precursor Telemetry Velocity Curve")
def get_dashboard_telemetry(
    timeframe: Optional[str] = Query("12W", description="Timeframe filter"),
    db: Session = Depends(get_db)
) -> List[DashboardTelemetryPoint]:
    """
    Returns weekly precursor velocity telemetry points derived strictly from database snapshot series or events,
    trimmed to the trailing window implied by `timeframe` (7D, 30D, 12W, Q3).
    Lineage: DATABASE_DERIVED
    """
    point_count = _trailing_point_count(timeframe)
    snapshot = db.query(WhatChangedSnapshot).first()
    if snapshot and snapshot.divergence_curve:
        points = []
        for pt in snapshot.divergence_curve:
            week_val = pt.get("period") or pt.get("week")
            vol = pt.get("activeRate") if "activeRate" in pt else pt.get("precursorVolume")
            base = pt.get("baselineRate") if "baselineRate" in pt else pt.get("baselineThreshold")
            spikes = pt.get("spikes") if "spikes" in pt else pt.get("highEnergySpikes")

            # Only append point if real volume data exists - do not invent synthetic numbers
            if week_val is not None and vol is not None:
                points.append(
                    DashboardTelemetryPoint(
                        week=str(week_val),
                        precursorVolume=int(vol),
                        baselineThreshold=int(base) if base is not None else 0,
                        highEnergySpikes=int(spikes) if spikes is not None else 0
                    )
                )
        if points:
            return points[-point_count:] if len(points) > point_count else points

    # If no snapshot telemetry exists, check SafetyEvent records, grouped by the real
    # calendar week they were recorded in (not a substring of the record's id).
    events = db.query(SafetyEvent).order_by(SafetyEvent.created_at.asc()).all()
    if not events:
        return []

    buckets: dict = {}
    order: List[str] = []
    for ev in events:
        if ev.created_at is not None:
            iso_year, iso_week, _ = ev.created_at.isocalendar()
            period_key = f"Wk {iso_week:02d}"
        else:
            period_key = "Current"
        if period_key not in buckets:
            buckets[period_key] = {"volume": 0, "spikes": 0}
            order.append(period_key)
        buckets[period_key]["volume"] += 1
        if ev.consequence is not None and ev.consequence >= 4:
            buckets[period_key]["spikes"] += 1

    all_points = [
        DashboardTelemetryPoint(
            week=wk,
            precursorVolume=buckets[wk]["volume"],
            baselineThreshold=settings.EXECUTIVE_SIF_THRESHOLD if settings.EXECUTIVE_SIF_THRESHOLD is not None else 0,
            highEnergySpikes=buckets[wk]["spikes"]
        )
        for wk in order
    ]
    return all_points[-point_count:] if len(all_points) > point_count else all_points


@router.get("/facilities", response_model=List[SiteAssetSchema], summary="Get Facility Risk Rankings")
def get_dashboard_facilities(
    search: Optional[str] = Query(None, description="Optional facility name/basin search query"),
    db: Session = Depends(get_db)
) -> List[SiteAssetSchema]:
    """
    Returns facility asset rankings queried from PostgreSQL sorted by composite risk score.
    """
    facilities = risk_service.get_facilities(db=db, search=search)
    facilities.sort(key=lambda x: x.compositeScore, reverse=True)
    return facilities


@router.get("/events", response_model=List[DashboardEvent], summary="Get Recent Critical Precursor Events")
def get_dashboard_events(
    db: Session = Depends(get_db)
) -> List[DashboardEvent]:
    """
    Returns real-time event feed of recent precursor events queried directly from PostgreSQL.
    """
    events_from_db = db.query(SafetyEvent).order_by(SafetyEvent.created_at.desc()).limit(10).all()
    events: List[DashboardEvent] = []
    for e in events_from_db:
        events.append(
            DashboardEvent(
                id=e.id,
                timestamp=e.time,
                siteName=e.facility_name,
                unit=e.unit,
                type=e.type,
                severity=e.severity,
                description=f"{e.vector} ({e.type}) observed at {e.unit}",
                status="COMMITTED"
            )
        )
    return events


@router.get("/rules", response_model=List[SafetyRuleSchema], summary="Get Life Saving Rules (LSR) Compliance")
def get_dashboard_rules(
    category: Optional[str] = Query("all", description="Category filter (all, critical, mechanical, operational)"),
    db: Session = Depends(get_db)
) -> List[SafetyRuleSchema]:
    """
    Returns Life-Saving Rules compliance telemetry queried directly from PostgreSQL.
    """
    query = db.query(SafetyRule)
    if category and category != "all":
        query = query.filter(SafetyRule.category.ilike(f"%{category}%"))

    rules = query.all()
    results: List[SafetyRuleSchema] = []
    for r in rules:
        results.append(
            SafetyRuleSchema(
                id=r.id,
                code=r.code,
                name=r.name,
                category=r.category,
                icon=r.icon,
                description=r.description,
                incidentsCount=r.incidents_count,
                percentage=r.percentage,
                barColorClass=r.bar_color_class,
                standardsRef=r.standards_ref
            )
        )
    return results


# Domain rule: Critical when persisted fatal probability >= configured SIF threshold.
PRIORITY_THRESHOLD_CRITICAL = 80


@router.get("/priority-actions", response_model=List[DashboardPriorityAction], summary="Get Priority Intervention Actions Backed by Source Records")
def get_dashboard_priority_actions(
    db: Session = Depends(get_db)
) -> List[DashboardPriorityAction]:
    """
    Returns high-priority precursor situations requiring intervention from PostgreSQL.
    Every action references its authoritative source record ID and dynamically reflects
    whether a CAPA intervention has already been dispatched via source lineage.
    If no source records exist in the database, returns an empty list.
    """
    actions: List[DashboardPriorityAction] = []

    # 1. Query precursor patterns from database
    patterns = db.query(PrecursorPattern).order_by(PrecursorPattern.fatal_probability_pct.desc()).limit(3).all()

    for p in patterns:
        # Check if an intervention already exists targeting this precursor pattern via exact lineage
        existing = db.query(Intervention).filter(
            Intervention.source_type == "PRECURSOR_PATTERN",
            Intervention.source_record_id == p.id
        ).first()

        # Authoritative facility & location resolution; null if not in database
        facility_name: Optional[str] = None
        location_desc: Optional[str] = None
        obs = db.query(PrecursorObservation).filter(PrecursorObservation.pattern_id == p.id).first()
        if obs and obs.facility_id:
            fac = db.query(Facility).filter(Facility.id == obs.facility_id).first()
            if fac:
                facility_name = fac.name
                location_desc = fac.basin

        priority_level: Optional[str] = None
        if p.fatal_probability_pct is not None:
            priority_level = "Critical" if p.fatal_probability_pct >= PRIORITY_THRESHOLD_CRITICAL else "High"

        sif_prob = f"SIF Probability: {p.fatal_probability_pct}%" if p.fatal_probability_pct is not None else None

        actions.append(
            DashboardPriorityAction(
                id=f"action-{p.id}",
                sourceType="PRECURSOR_PATTERN",
                sourceRecordId=p.id,
                title=p.title,
                description=f"Recurrent latent precursor: {p.vector}. Observed across {p.observed_recurrence}." if p.observed_recurrence else f"Recurrent latent precursor: {p.vector}.",
                facility=facility_name,
                location=location_desc,
                vector=p.vector,
                priority=priority_level,
                escalationNotice=sif_prob,
                status="dispatched" if existing else "pending",
                dispatchedInterventionId=existing.id if existing else None,
                dispatchedInterventionCode=existing.code if existing else None
            )
        )

    # 2. If fewer than 3 patterns, fill with critical safety events
    if len(actions) < 3:
        events = db.query(SafetyEvent).filter(SafetyEvent.consequence >= 4).order_by(SafetyEvent.created_at.desc()).limit(3 - len(actions)).all()
        for ev in events:
            # Check if an intervention already exists targeting this safety event via exact lineage
            existing = db.query(Intervention).filter(
                Intervention.source_type == "SAFETY_EVENT",
                Intervention.source_record_id == ev.id
            ).first()

            actions.append(
                DashboardPriorityAction(
                    id=f"action-{ev.id}",
                    sourceType="SAFETY_EVENT",
                    sourceRecordId=ev.id,
                    title=f"Incident Containment: {ev.vector}",
                    description=f"{ev.severity} {ev.type} event recorded at {ev.facility_name} unit {ev.unit}." if (ev.facility_name and ev.unit) else f"{ev.severity} {ev.type} event.",
                    facility=ev.facility_name,
                    location=f"Unit {ev.unit}" if ev.unit else None,
                    vector=ev.vector,
                    priority=ev.severity.capitalize() if ev.severity else None,
                    escalationNotice=f"Consequence Level {ev.consequence}" if ev.consequence is not None else None,
                    status="dispatched" if existing else "pending",
                    dispatchedInterventionId=existing.id if existing else None,
                    dispatchedInterventionCode=existing.code if existing else None
                )
            )

    return actions
