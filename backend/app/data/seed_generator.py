"""
Deterministic Synthetic Seed Data Generator for PRECURSOR-X.

DATA PROVENANCE: everything produced by this module is SYNTHETIC DEMONSTRATION DATA,
generated with a fixed random seed for reproducibility across deploys. It exists solely
to give the time-series-driven charts (Dashboard telemetry, Safety DNA occurrence counts,
Risk Intelligence 5x5 matrix, What Changed differential) enough volume to render
meaningfully. Nothing here is inserted anywhere except PostgreSQL via app/db/seed.py, and
every row is written with the same SYNTHETIC/DEMO provenance as the rest of the seed data.
No value from this module is ever hardcoded into the frontend — it only ever reaches the
UI by being read back out of the database through the normal API routes.

Regenerating with the same SEED always produces the same rows, so re-running the seed
script is reproducible and idempotent-looking (though the actual insert loops in
app/db/seed.py are separately guarded to only run once per table).
"""

import random
from datetime import timedelta
from typing import Any, Dict, List, Tuple

SEED = 20260101  # fixed seed: deterministic, reproducible synthetic generation

ACTIVITIES = ["confined", "isolation", "hotwork", "height", "lifting"]
ACTIVITY_LSR = {
    "confined": "lsr-04",
    "isolation": "lsr-01",
    "hotwork": "lsr-08",
    "height": "lsr-02",
    "lifting": "lsr-05",
}

BARRIER_NAMES = [
    "Atmospheric Sniffer Calibration",
    "Mechanical LOTO Lockout",
    "Fire Watch Exclusion Zone",
    "Combustible LEL Detector",
    "Tagline Rigging Integrity",
    "Blind Lift Spotter",
    "Spectacle Blind Reversal",
    "Pressure Gauge Bleed-Off",
    "Flange Bolt Torque Spec",
    "Gasket Integrity Check",
    "Anchor Point Load Rating",
    "Breaker Nameplate Verification",
    "PSV Isolation Valve Position",
    "Crane Signal Confirmation",
    "Concurrent Operations Review",
]

SHIFTS = ["Day", "Night", "Swing"]

UNITS = [
    "TK-402 Desander", "Flash Drum Separator V-104", "Turbine Compressor Unit-3",
    "Crude Unit Flare Knockout Drum", "MCC Cabinet Bank 4B", "Separator V-201",
    "Pedestal Crane #1", "Flare Stack Access Platform L4", "CDU Column Flange Perimeter",
    "Skid Transfer Crane Pedestal #2", "Wellhead Manifold Skid", "Compression Train B",
    "Riser Base Manifold", "LNG Train 2 Cold Box", "Gas-Oil Separation Plant Train 1",
]

HAZARD_POOL = [
    "Hydrogen Sulfide (H2S) Accumulation", "Oxygen Deficiency (<19.5% Vol)",
    "Hydrocarbon Vapor Ingress", "480V Live Bus Energization", "Arc Flash Potential",
    "Stored Mechanical Pressure", "Suspended Dynamic Load", "Elevated Fall Exposure",
    "Flammable Atmosphere Ignition", "Overpressure / Loss of Containment",
]

PRECURSOR_PHRASES = [
    "Omitted secondary gas sniff", "Incomplete mechanical lockout (tag without padlock)",
    "Shift change temporal window", "Manifold pass-through leak during purge",
    "Inadequate continuous sniffer placement", "Defective seal seating",
    "Adjacent breaker mislabeling", "Night-shift turnover communication lapse",
    "Incomplete visual verification", "Corroded anchor point load rating uncertainty",
    "Weather hold override without engineering sign-off", "LEL monitor calibration drift",
    "No concurrent operations risk review filed", "PSV isolation valve position not verified",
    "Radio signal dead zone during lift", "Exclusion zone barricade not re-verified",
]

REPORT_TYPES = ["Near Miss", "Incident", "Observation"]
SIF_LEVELS = ["CRITICAL", "HIGH", "MODERATE"]
REPORTERS = [
    "S. Jenkins (PTW Holder)", "J. McDonnell (Shift Lead)", "R. Saikia (Senior Electrician)",
    "A. Okafor (Process Safety Engineer)", "M. Villanueva (Area Supervisor)",
    "T. Halvorsen (Offshore Installation Manager)", "P. Nguyen (Maintenance Technician)",
    "L. Andersson (HSE Coordinator)", "K. Al-Farsi (Shift Supervisor)", "D. Brennan (Rigging Foreman)",
]


def generate_precursor_observations(
    pattern_ids: List[str], facility_ids: List[str], count: int = 480
) -> List[Tuple[str, str, int, bool, str]]:
    """
    Returns (pattern_id, facility_id, days_ago, energy_spike_detected, barrier_name) tuples
    spread across the trailing 365 days, giving Safety DNA occurrence counts, the What
    Changed baseline/active differential, and Knowledge Graph incident counts enough volume
    to plot a real distribution instead of a handful of points.
    """
    rnd = random.Random(SEED)
    rows: List[Tuple[str, str, int, bool, str]] = []
    for _ in range(count):
        pattern_id = rnd.choice(pattern_ids)
        facility_id = rnd.choice(facility_ids)
        # Skew towards more-recent days so the 30D active window has a visible spike over baseline,
        # consistent with the facilities' own stated "critical delta" / trend fields.
        if rnd.random() < 0.45:
            days_ago = rnd.randint(0, 30)
        elif rnd.random() < 0.7:
            days_ago = rnd.randint(31, 90)
        else:
            days_ago = rnd.randint(91, 365)
        spike = rnd.random() < 0.35
        barrier = rnd.choice(BARRIER_NAMES)
        rows.append((pattern_id, facility_id, days_ago, spike, barrier))
    return rows


def generate_sif_precursor_velocity_series(
    target_current: int, weeks: int = 16, executive_threshold: int = 150, seed_offset: int = 6
) -> List[Dict[str, Any]]:
    """
    Returns a deterministic weekly SIF precursor volume time series ending exactly at
    `target_current` (the live sum of Facility.sifPrecursors, i.e. the same number the
    Dashboard's "Active SIF Precursors" tile reports), so the escalation chart's current
    point and the headline metric never disagree.

    The curve escalates from a low baseline with occasional pullbacks (representing
    temporary barrier interventions), rather than a straight line or a single late spike,
    while remaining fully deterministic (fixed RNG seed) and reproducible across deploys.
    Every point this produces is written to PostgreSQL once via app/db/seed.py and read
    back through the normal API route — nothing here is generated per-request or on the
    frontend.
    """
    rnd = random.Random(SEED + seed_offset)
    baseline = 1

    # Build an unscaled escalation shape: mostly growing, with occasional dips.
    raw: List[float] = []
    val = float(baseline)
    for _ in range(weeks):
        growth = rnd.uniform(0.85, 0.97) if rnd.random() < 0.22 else rnd.uniform(1.08, 1.35)
        val = max(float(baseline), val * growth)
        raw.append(val)

    # Rescale the shape so it lands exactly on target_current at the final week, preserving
    # the relative ups/downs of the generated curve instead of just interpolating a straight line.
    span = raw[-1] - baseline
    scale = (target_current - baseline) / span if span > 1e-6 else 1.0

    volumes: List[int] = []
    for v in raw:
        scaled = baseline + (v - baseline) * scale
        volumes.append(max(1, int(round(scaled))))
    volumes[0] = baseline
    volumes[-1] = target_current  # exact agreement with the live facility-total metric

    # Fixed week-of-year style labels (deterministic, not derived from datetime.now()).
    end_week = 77
    start_week = end_week - weeks + 1

    series: List[Dict[str, Any]] = []
    for i, vol in enumerate(volumes):
        week_num = start_week + i
        spikes = rnd.randint(1, 3) if rnd.random() < 0.3 else 0
        series.append({
            "week": f"Wk {week_num:02d}",
            "precursorVolume": vol,
            "baselineThreshold": executive_threshold,
            "highEnergySpikes": spikes,
        })
    return series


# Primary key of the single seed-owned WhatChangedSnapshot row (see app/db/seed.py).
# Shared here so both the seeder and the synchronization check reference one constant.
SEED_WHAT_CHANGED_SNAPSHOT_ID = "snap-current-7d"


def is_velocity_series_stale(curve: Any, target_current: int, min_weeks: int = 16) -> bool:
    """
    Returns True if a persisted divergence_curve does NOT already match what
    generate_sif_precursor_velocity_series() would produce for the given target —
    i.e. it predates the 16-week generator (too few points, missing the
    week/precursorVolume shape) or its final point has drifted from the live
    Active SIF Precursors total (e.g. facility data changed since it was written).

    Used to make WhatChangedSnapshot synchronization idempotent: a curve that is
    already in sync is left completely untouched.
    """
    if not curve or not isinstance(curve, list):
        return True
    if len(curve) < min_weeks:
        return True
    if not all(
        isinstance(pt, dict) and "week" in pt and "precursorVolume" in pt
        for pt in curve
    ):
        return True
    last_volume = curve[-1].get("precursorVolume")
    if last_volume != target_current:
        return True
    return False


def generate_risk_observations(
    facility_ids: List[str], facility_risk: Dict[str, str]
) -> List[Tuple[str, str, str, int, int, int]]:
    """
    Returns (facility_id, activity, lsr_code, consequence_tier, frequency_tier, event_count)
    rows covering every facility across all 5 tracked activities, so the 5x5 Risk Matrix has
    real observations in most cells instead of the previous 8 static rows.
    Higher-risk facilities are weighted towards higher consequence/frequency tiers, consistent
    with their own stated riskClassification.
    """
    rnd = random.Random(SEED + 1)
    tier_bias = {
        "Critical": (3, 5),
        "High": (2, 4),
        "Moderate": (2, 4),
        "Stable": (1, 3),
    }
    rows: List[Tuple[str, str, str, int, int, int]] = []
    idx = 0
    for fac_id in facility_ids:
        risk_class = facility_risk.get(fac_id, "Moderate")
        lo, hi = tier_bias.get(risk_class, (1, 4))
        # Not every facility performs every activity every period — vary coverage realistically
        active_activities = rnd.sample(ACTIVITIES, k=rnd.randint(3, 5))
        for activity in active_activities:
            consequence_tier = rnd.randint(max(1, lo - 1), min(5, hi))
            frequency_tier = rnd.randint(max(1, lo - 1), min(5, hi))
            event_count = rnd.randint(8, 180)
            idx += 1
            rows.append((fac_id, activity, ACTIVITY_LSR[activity], consequence_tier, frequency_tier, event_count))
    return rows


def generate_additional_reports(
    sites: List[Dict[str, Any]], count: int = 48
) -> List[Dict[str, Any]]:
    """
    Returns additional SYNTHETIC_REPORTS-shaped dicts, spread across ~48 distinct weeks so the
    Dashboard's weekly telemetry chart (bucketed from SafetyEvent records derived 1:1 from these
    reports) and the Risk Intelligence timeline have real multi-week coverage instead of 3 points.
    Report IDs are constructed as rep-<week><seq> so the dashboard's week-bucketing keys off the
    first two digits of the numeric suffix, same convention as the hand-authored seed reports.
    """
    rnd = random.Random(SEED + 2)
    reports: List[Dict[str, Any]] = []
    for i in range(count):
        week = (i % 48) + 1
        seq = i // 48
        site = rnd.choice(sites)
        unit = rnd.choice(UNITS)
        activity_key = rnd.choice(ACTIVITIES)
        lsr_code = ACTIVITY_LSR[activity_key]
        report_type = rnd.choice(REPORT_TYPES)
        sif_level = rnd.choice(SIF_LEVELS)
        precursor_a = rnd.choice(PRECURSOR_PHRASES)
        precursor_b = rnd.choice([p for p in PRECURSOR_PHRASES if p != precursor_a])
        hazard = rnd.choice(HAZARD_POOL)
        confidence = round(rnd.uniform(0.72, 0.97), 3)
        report_id = f"rep-{week:02d}{seq:03d}"
        # Same recency skew as the precursor observations, so SafetyEvent.created_at (set from this
        # in app/db/seed.py) produces a real baseline-vs-active split for the What Changed differential
        # instead of every row landing on the seed script's single execution instant.
        if rnd.random() < 0.45:
            days_ago = rnd.randint(0, 30)
        elif rnd.random() < 0.7:
            days_ago = rnd.randint(31, 90)
        else:
            days_ago = rnd.randint(91, 365)
        reports.append({
            "id": report_id,
            "code": f"NM-{2023 + (i % 3)}-{2000 + i}",
            "daysAgo": days_ago,
            "siteId": site["id"],
            "siteName": site["name"],
            "unit": unit,
            "activity": activity_key,
            "reportType": report_type,
            "description": (
                f"During routine {activity_key} operations at {unit}, field crew identified a "
                f"precursor condition: {precursor_a.lower()}, compounded by {precursor_b.lower()}. "
                f"Exposure to {hazard.lower()} was assessed as {sif_level.lower()} SIF potential. "
                f"Shift supervisor logged the observation and dispatched a follow-up barrier check."
            ),
            "sifPotential": sif_level,
            "confidence": confidence,
            "hazards": [hazard],
            "precursors": [precursor_a, precursor_b],
            "lifeSavingRules": [f"{lsr_code.upper()}"],
            "barrierFailures": [
                {"name": rnd.choice(BARRIER_NAMES), "status": rnd.choice(["FAILED", "BYPASSED", "EFFECTIVE"])}
            ],
            "consequences": [hazard],
            "reporter": rnd.choice(REPORTERS),
            "status": rnd.choice(["COMMITTED", "VERIFIED", "PENDING_REVIEW"])
        })
    return reports


CONSEQUENCE_TIERS = ["CRITICAL", "HIGH", "MODERATE"]
ROOT_CAUSE_POOL = [
    "Shift handover communication gap left isolation status unconfirmed.",
    "Time pressure to complete turnaround before the maintenance window closed.",
    "Reliance on nameplate labeling instead of cross-referencing the single-line diagram.",
    "Calibration drift on the atmospheric monitor went undetected between checks.",
    "Weather-hold procedure was overridden without an engineering review.",
    "Concurrent operations were not flagged during permit issuance.",
    "Anchor point inspection interval had lapsed past its due date.",
    "Radio channel congestion prevented timely stop-work confirmation.",
]
CORRECTIVE_ACTION_POOL = [
    "Mandatory dual-verification sign-off added before permit activation.",
    "Automated barcode scan required on physical lockout keys.",
    "Concurrent-operations risk review made a hard gate in the permit workflow.",
    "Anchor point inspection interval shortened and tied to a digital reminder.",
    "Second-party gas sniff protocol dispatched to the affected unit.",
    "Breaker cluster relabeled and cross-referenced against as-built diagrams.",
    "Weather-hold override now requires documented engineering sign-off.",
    "Radio dead-zone mapped and a backup visual signal procedure added.",
]


def generate_additional_memory_records(sites: List[Dict[str, Any]], count: int = 24) -> List[Dict[str, Any]]:
    """
    Returns additional SAFETY_MEMORY_DATA-shaped precedent dicts so the Safety Memory search
    page has enough varied, genuinely keyword-searchable records to return meaningful result
    sets instead of the same 4 entries for every query.
    """
    rnd = random.Random(SEED + 3)
    records: List[Dict[str, Any]] = []
    for i in range(count):
        site = rnd.choice(sites)
        unit = rnd.choice(UNITS)
        activity_key = rnd.choice(ACTIVITIES)
        lsr_code = ACTIVITY_LSR[activity_key]
        tier = rnd.choice(CONSEQUENCE_TIERS)
        year = 2019 + (i % 7)
        precursor_a = rnd.choice(PRECURSOR_PHRASES)
        precursor_b = rnd.choice([p for p in PRECURSOR_PHRASES if p != precursor_a])
        root_cause = rnd.choice(ROOT_CAUSE_POOL)
        corrective = rnd.choice(CORRECTIVE_ACTION_POOL)
        barrier = rnd.choice(BARRIER_NAMES)
        code = f"PREC-{year}-{3000 + i}"
        records.append({
            "id": f"mem-gen-{i + 1:03d}",
            "code": code,
            "precedentCode": code,
            "title": f"{barrier} Deficiency During {activity_key.capitalize()} Operations — {unit}",
            "year": year,
            "facility": site["name"],
            "operationalContext": (
                f"During {activity_key} activity at {unit} ({site['name']}), field crew encountered "
                f"{precursor_a.lower()}, later compounded by {precursor_b.lower()}. The condition was "
                f"logged as a {tier.lower()} SIF-potential precedent under {lsr_code.upper()}."
            ),
            "precursorSignature": f"{precursor_a} + {precursor_b}",
            "failedBarriers": [barrier],
            "rootCauses": [root_cause],
            "correctiveActions": [corrective],
            "consequenceTier": tier,
            "lsrViolated": lsr_code.upper(),
            "similarityVector": {}
        })
    return records


INTERVENTION_STATUSES = ["Proposed", "Under Review", "Approved", "In Progress", "Completed"]
INTERVENTION_PRIORITIES = ["Critical", "High", "Moderate", "Low"]
OWNERS = [
    ("D. Holloway", "Lead HSE Specialist"), ("E. Vance", "Ops Lead"),
    ("R. Saikia", "Senior Electrician"), ("A. Okafor", "Process Safety Engineer"),
    ("M. Villanueva", "Area Supervisor"), ("T. Halvorsen", "Offshore Installation Manager"),
    ("L. Andersson", "HSE Coordinator"), ("K. Al-Farsi", "Shift Supervisor"),
]


def generate_additional_interventions(sites: List[Dict[str, Any]], count: int = 22) -> List[Dict[str, Any]]:
    """
    Returns additional INITIAL_INTERVENTIONS-shaped CAPA dicts spread across every status/priority
    so the Interventions register reads as a real working register instead of 3 fixed rows.
    """
    rnd = random.Random(SEED + 4)
    records: List[Dict[str, Any]] = []
    for i in range(count):
        site = rnd.choice(sites)
        activity_key = rnd.choice(ACTIVITIES)
        lsr_code = ACTIVITY_LSR[activity_key]
        barrier = rnd.choice(BARRIER_NAMES)
        status = rnd.choice(INTERVENTION_STATUSES)
        priority = rnd.choice(INTERVENTION_PRIORITIES)
        owner, owner_role = rnd.choice(OWNERS)
        progress = {"Proposed": 0, "Under Review": rnd.randint(5, 15), "Approved": rnd.randint(15, 30),
                    "In Progress": rnd.randint(30, 85), "Completed": 100}[status]
        code = f"INT-{800 + i}"
        records.append({
            "id": f"int-gen-{i + 1:03d}",
            "code": code,
            "title": f"{barrier} Corrective Action Plan — {site['name']}",
            "description": f"Structural corrective action targeting recurring {barrier.lower()} deficiencies observed during {activity_key} operations at {site['name']}.",
            "precursorPattern": None,
            "targetedVector": f"{activity_key.capitalize()} Operations",
            "lsrCode": lsr_code.upper(),
            "lsrTitle": f"LSR: {activity_key.capitalize()} Operations",
            "sifRiskPct": round(rnd.uniform(40, 95), 1),
            "priority": priority,
            "status": status,
            "targetFacility": site["name"],
            "affectedSitesSummary": f"{site['name']} ({rnd.randint(1, 4)} Operating Units)",
            "observedRecurrence": f"{rnd.randint(4, 35)} Reports (Past 30 Rolling Days)",
            "protocolSteps": [
                f"Audit {barrier.lower()} compliance across all active permits.",
                "Dispatch supervisory verification sign-off requirement.",
                "Schedule follow-up field stand-down if non-conformance confirmed."
            ],
            "owner": owner,
            "ownerRole": owner_role,
            "dueDate": f"{2026}-{(i % 12) + 1:02d}-{(i % 27) + 1:02d}",
            "progressPct": progress,
            "verificationMetric": f"-{rnd.randint(30, 90)}% Precursors Post-Rollout",
            "createdAt": f"2026-{(i % 9) + 1:02d}-{(i % 27) + 1:02d}"
        })
    return records


REVIEW_STATUSES_WEIGHTED = (
    ["PENDING_REVIEW"] * 5 + ["CERTIFIED"] * 3 + ["ESCALATED"] * 2 + ["RECLASSIFIED"] * 2 + ["REJECTED"] * 1
)


def generate_additional_reviews(sites: List[Dict[str, Any]], count: int = 16) -> List[Dict[str, Any]]:
    """
    Returns additional INITIAL_REVIEWS-shaped dicts spread across PENDING_REVIEW / CERTIFIED /
    ESCALATED / RECLASSIFIED / REJECTED, with some AI confidence scores under 90% so the
    Human Review "Disagreements" tab has real entries instead of being empty.
    """
    rnd = random.Random(SEED + 5)
    records: List[Dict[str, Any]] = []
    for i in range(count):
        site = rnd.choice(sites)
        unit = rnd.choice(UNITS)
        activity_key = rnd.choice(ACTIVITIES)
        lsr_code = ACTIVITY_LSR[activity_key]
        status = rnd.choice(REVIEW_STATUSES_WEIGHTED)
        sif_level = rnd.choice(SIF_LEVELS)
        precursor_a = rnd.choice(PRECURSOR_PHRASES)
        precursor_b = rnd.choice([p for p in PRECURSOR_PHRASES if p != precursor_a])
        barrier = rnd.choice(BARRIER_NAMES)
        # Roughly a third land under 90% confidence so the "Disagreements" tab has real content
        ai_confidence = rnd.randint(72, 89) if rnd.random() < 0.35 else rnd.randint(90, 99)
        ai_sif_score = rnd.randint(55, 98)
        reporter = rnd.choice(REPORTERS)
        code = f"NM-2026-{5000 + i}"
        records.append({
            "id": f"rev-gen-{i + 1:03d}",
            "incidentCode": code,
            "siteName": site["name"],
            "unit": unit,
            "eventTime": f"{rnd.randint(1, 27)}d ago, {rnd.randint(0, 23):02d}:{rnd.randint(0, 59):02d} UTC",
            "reporter": reporter,
            "vectorHash": f"#{rnd.randint(10000, 99999):x}-{rnd.randint(100, 999):x}",
            "title": f"{barrier} Deficiency During {activity_key.capitalize()} Operations",
            "narrative": (
                f"During {activity_key} operations at {unit} ({site['name']}), field crew identified "
                f"{precursor_a.lower()}, compounded by {precursor_b.lower()}. AI classification flagged "
                f"{sif_level.lower()} SIF potential pending specialist calibration."
            ),
            "annotatedTokens": [],
            "aiSifLevel": sif_level,
            "aiSifScorePct": ai_sif_score,
            "aiConfidencePct": ai_confidence,
            "primaryLsr": f"{lsr_code.upper()}: {activity_key.capitalize()} Operations",
            "secondaryLsr": None,
            "featureTags": [{"name": precursor_a, "weight": rnd.uniform(70, 99)}],
            "barriers": [{"id": f"b-gen-{i}", "code": f"B-GEN-{i}", "name": barrier, "description": "Field barrier check", "status": rnd.choice(["FAILED", "BYPASSED", "EFFECTIVE"])}],
            "specialistNotes": None,
            "status": status,
            "opticalFeed": None
        })
    return records
