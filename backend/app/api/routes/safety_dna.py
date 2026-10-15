"""
Safety DNA API Routes.
Provides systemic genomic patterns, causal chain pathways, and systemic blindspot metrics
calculated from PostgreSQL database records.
Lineage: DATABASE / DATABASE_DERIVED
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ...models.entities import PrecursorPattern, PrecursorObservation, Facility
from ...db.session import get_db

router = APIRouter(prefix="/safety-dna", tags=["Safety DNA"])


@router.get("/patterns", response_model=List[Dict[str, Any]], summary="Get Systemic Precursor DNA Patterns")
def get_safety_dna_patterns(
    category: Optional[str] = Query(None, description="Optional category filter"),
    search: Optional[str] = Query(None, description="Optional search term"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Returns identified precursor combination patterns mapping hazards, procedural breaches, and behavioral variance
    from PostgreSQL precursor_patterns table.
    Lineage: DATABASE / DATABASE_DERIVED
    """
    query = db.query(PrecursorPattern)
    if search:
        q = f"%{search.strip()}%"
        query = query.filter(
            (PrecursorPattern.title.ilike(q)) |
            (PrecursorPattern.code.ilike(q)) |
            (PrecursorPattern.vector.ilike(q))
        )

    patterns = query.all()
    results = []

    now = datetime.now(timezone.utc)
    t_30d = now - timedelta(days=30)
    t_60d = now - timedelta(days=60)

    def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
        if dt is None:
            return None
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

    for p in patterns:
        # 1. Real occurrences strictly from PrecursorObservation records
        observations = db.query(PrecursorObservation).filter(
            PrecursorObservation.pattern_id == p.id
        ).order_by(PrecursorObservation.observation_time.asc()).all()

        actual_occurrences = len(observations)

        # 2. Real affected facilities from PrecursorObservation -> Facility relationship
        observed_facility_ids = list({obs.facility_id for obs in observations if obs.facility_id})
        if observed_facility_ids:
            fac_records = db.query(Facility).filter(Facility.id.in_(observed_facility_ids)).all()
            assigned_sites = [f.name for f in fac_records]
            affected_count = len(assigned_sites)
        else:
            assigned_sites = []
            affected_count = 0

        # 3. Real trend derived from actual observation counts across two time windows:
        #    Recent 30 days vs Previous 30-60 days
        recent_count = sum(1 for obs in observations if obs.observation_time and _as_utc(obs.observation_time) >= t_30d)
        prior_count = sum(1 for obs in observations if obs.observation_time and t_60d <= _as_utc(obs.observation_time) < t_30d)

        if prior_count > 0:
            trend_val = round(((recent_count - prior_count) / float(prior_count)) * 100.0, 1)
        elif recent_count > 0:
            trend_val = 100.0
        else:
            trend_val = 0.0

        # 4. Real MTBO (Mean Time Between Observations) calculated from actual observation timestamps
        if actual_occurrences >= 2:
            intervals = [
                (_as_utc(observations[i].observation_time) - _as_utc(observations[i - 1].observation_time)).total_seconds() / 86400.0
                for i in range(1, actual_occurrences)
                if observations[i].observation_time and observations[i - 1].observation_time
            ]
            mtbo_days = round(sum(intervals) / max(1, len(intervals)), 1) if intervals else None
        else:
            mtbo_days = None

        results.append({
            "id": p.id,
            "code": p.code,
            "name": p.title,
            "category": p.vector,
            "sifPotential": "CRITICAL" if p.fatal_probability_pct >= 80 else "HIGH",
            "sifScore": p.fatal_probability_pct,
            "occurrences": actual_occurrences,
            "affectedSitesCount": affected_count,
            "affectedSites": assigned_sites,
            "trend30dPct": trend_val,
            "mtboDays": mtbo_days,
            "confidence": float(p.confidence),
            "keyVector": p.vector,
            "status": "ACTIVE THREAT VECTOR" if actual_occurrences > 0 else "DORMANT PATTERN",
            "description": f"Precursor pattern {p.code} in {p.vector} governed by {p.lsr_code}.",
            "triad": p.triad or {}
        })

    return results


@router.get("/causal-chain", response_model=Dict[str, Any], summary="Get Causal Chain Pathway")
def get_causal_chain(
    pattern_id: Optional[str] = Query("gen-cs-loto-01", description="Pattern ID"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Returns step-by-step causal chain triad showing hazard -> trigger -> breach -> variance -> consequence
    from PostgreSQL.
    Lineage: DATABASE
    """
    pattern = db.query(PrecursorPattern).filter(
        (PrecursorPattern.id == pattern_id) | (PrecursorPattern.code == pattern_id)
    ).first()

    if not pattern:
        pattern = db.query(PrecursorPattern).first()

    if not pattern:
        return {
            "patternId": "none",
            "patternCode": "NONE",
            "patternName": "No Pattern in Database",
            "triad": {},
            "sifPotential": "LOW",
            "occurrences": 0,
            "affectedSites": []
        }

    # Query real observations for this pattern
    observations = db.query(PrecursorObservation).filter(
        PrecursorObservation.pattern_id == pattern.id
    ).all()
    actual_occurrences = len(observations)

    observed_facility_ids = list({obs.facility_id for obs in observations if obs.facility_id})
    if observed_facility_ids:
        fac_records = db.query(Facility).filter(Facility.id.in_(observed_facility_ids)).all()
        affected_sites = [f.name for f in fac_records]
    else:
        affected_sites = []

    return {
        "patternId": pattern.id,
        "patternCode": pattern.code,
        "patternName": pattern.title,
        "triad": pattern.triad or {},
        "sifPotential": "CRITICAL" if pattern.fatal_probability_pct >= 80 else "HIGH",
        "occurrences": actual_occurrences,
        "affectedSites": affected_sites
    }


@router.get("/metrics", response_model=Dict[str, Any], summary="Get Safety DNA Genomic Metrics")
def get_safety_dna_metrics(
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Returns systemic blindspot metrics, precursor velocity indexes, and genomic stability score
    calculated strictly from PostgreSQL records.
    Lineage: DATABASE_DERIVED

    Documented deterministic formulas:
    - systemicBlindspotsIdentified: Patterns with fatal_probability_pct >= 80 having active unmitigated observations.
    - activeGenomicThreatVectors: Distinct patterns with at least one recorded observation.
    - genomicStabilityIndex: 100 - (precursor frequency penalty + unmitigated barrier penalty).
    - meanTimeToPrecursorRecurrenceDays: Mean recurrence interval across patterns with >= 2 observations.
    - precursorVelocityGrowthPct: Period-over-period observation volume growth between current 30d and prior 30d.
    """
    patterns = db.query(PrecursorPattern).all()
    total_patterns = len(patterns)

    if total_patterns == 0:
        return {
            "systemicBlindspotsIdentified": 0,
            "genomicStabilityIndex": 100.0,
            "meanTimeToPrecursorRecurrenceDays": None,
            "precursorVelocityGrowthPct": 0.0,
            "activeGenomicThreatVectors": 0,
            "totalClusteredObservations": 0,
            "activeThreatVectors": 0,
            "decayingBarriersCount": 0,
            "barrierDecayRadar": []
        }

    now = datetime.now(timezone.utc)
    t_30d = now - timedelta(days=30)
    t_60d = now - timedelta(days=60)

    # All observations in database
    all_obs = db.query(PrecursorObservation).all()
    total_obs = len(all_obs)

    # Active patterns that have real observations
    active_pattern_ids = {obs.pattern_id for obs in all_obs if obs.pattern_id}
    active_threat_vectors = len(active_pattern_ids)

    # Blindspots: critical patterns (fatal_probability_pct >= 80) with observations
    critical_pattern_ids = {p.id for p in patterns if p.fatal_probability_pct is not None and p.fatal_probability_pct >= 80}
    blindspots = len(critical_pattern_ids.intersection(active_pattern_ids))

    # Genomic stability index: starts at 100, drops with energy spikes detected in observations
    spikes_count = sum(1 for obs in all_obs if obs.energy_spike_detected)
    barrier_failures_count = sum(1 for obs in all_obs if obs.barrier_failed)
    stability_index = round(max(20.0, 100.0 - (spikes_count * 4.5) - (barrier_failures_count * 2.0)), 1)

    # Period-over-period velocity growth
    recent_obs_count = sum(1 for obs in all_obs if obs.observation_time and obs.observation_time >= t_30d)
    prior_obs_count = sum(1 for obs in all_obs if obs.observation_time and t_60d <= obs.observation_time < t_30d)

    if prior_obs_count > 0:
        velocity_growth = round(((recent_obs_count - prior_obs_count) / float(prior_obs_count)) * 100.0, 1)
    elif recent_obs_count > 0:
        velocity_growth = 100.0
    else:
        velocity_growth = 0.0

    # Recurrence interval: calculate mean interval across all patterns that have >= 2 observations
    pattern_intervals: List[float] = []
    for pid in active_pattern_ids:
        p_obs = sorted(
            [o for o in all_obs if o.pattern_id == pid and o.observation_time],
            key=lambda x: x.observation_time
        )
        if len(p_obs) >= 2:
            diffs = [
                (p_obs[i].observation_time - p_obs[i - 1].observation_time).total_seconds() / 86400.0
                for i in range(1, len(p_obs))
            ]
            if diffs:
                pattern_intervals.append(sum(diffs) / len(diffs))

    mtbo_days = round(sum(pattern_intervals) / len(pattern_intervals), 1) if pattern_intervals else None

    # Barrier Decay Radar derived strictly from observations in PostgreSQL
    failed_barriers = list({obs.barrier_failed for obs in all_obs if obs.barrier_failed})
    decay_radar = []
    for b_name in failed_barriers:
        b_count = sum(1 for o in all_obs if o.barrier_failed == b_name)
        b_recent = sum(1 for o in all_obs if o.barrier_failed == b_name and o.observation_time and o.observation_time >= t_30d)
        integ = max(10.0, round(100.0 - (b_count * 6.5), 1))
        drift = round((b_recent / max(1, b_count)) * 15.0, 1)
        decay_radar.append({
            "barrier": b_name,
            "integrityPct": integ,
            "driftRatePct": drift
        })

    decaying_count = sum(1 for d in decay_radar if d["integrityPct"] < 85.0)

    return {
        "systemicBlindspotsIdentified": blindspots,
        "genomicStabilityIndex": stability_index,
        "meanTimeToPrecursorRecurrenceDays": mtbo_days,
        "precursorVelocityGrowthPct": velocity_growth,
        "activeGenomicThreatVectors": active_threat_vectors,
        "totalClusteredObservations": total_obs,
        "activeThreatVectors": active_threat_vectors,
        "decayingBarriersCount": decaying_count,
        "barrierDecayRadar": decay_radar
    }
