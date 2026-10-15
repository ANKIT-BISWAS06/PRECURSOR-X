"""
Risk Service.
Provides facility risk telemetry, 5x5 dynamic risk matrix calculation, and causal factor breakdown
calculated strictly from authoritative PostgreSQL records.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.entities import Facility, RiskObservation, SafetyEvent
from ..schemas.risk import (
    SiteAssetSchema,
    RiskMatrixCellSchema,
    CausalFactorSchema,
    RiskMatrixResponse,
    RiskTelemetryResponse,
    FacilitySummarySchema,
    RiskTimelinePoint
)


class RiskService:
    def get_facilities(
        self,
        db: Session,
        site: Optional[str] = "all",
        activity: Optional[str] = "all",
        lsr: Optional[str] = "all",
        timeframe: Optional[str] = "90",
        severity: Optional[str] = "all",
        search: Optional[str] = None
    ) -> List[SiteAssetSchema]:
        query = db.query(Facility)

        if site and site != "all":
            query = query.filter(Facility.id == site)

        if severity and severity != "all":
            query = query.filter(Facility.risk_classification.ilike(f"%{severity}%"))

        if search:
            q = f"%{search.strip()}%"
            query = query.filter(
                (Facility.name.ilike(q)) |
                (Facility.code.ilike(q)) |
                (Facility.basin.ilike(q)) |
                (Facility.region.ilike(q))
            )

        db_facilities = query.all()
        results: List[SiteAssetSchema] = []

        for f in db_facilities:
            if activity and activity != "all" and f.activities:
                if activity.lower() not in [str(a).lower() for a in f.activities]:
                    continue

            if lsr and lsr != "all" and f.lsr_codes:
                if lsr.lower() not in [str(code).lower() for code in f.lsr_codes]:
                    continue

            results.append(
                SiteAssetSchema(
                    id=f.id,
                    code=f.code,
                    name=f.name,
                    region=f.region,
                    type=f.type,
                    basin=f.basin,
                    activePermits=f.active_permits,
                    reportsAnalyzed=f.reports_analyzed,
                    sifPrecursors=f.sif_precursors,
                    precursorDelta=f.precursor_delta,
                    precursorDensityPct=f.precursor_density_pct,
                    barrierIntegrityPct=f.barrier_integrity_pct,
                    compositeScore=f.composite_score,
                    trend30d=f.trend_30d,
                    trendDirection=f.trend_direction,
                    riskClassification=f.risk_classification,
                    status=f.status
                )
            )

        return results

    def get_matrix(
        self,
        db: Session,
        timeframe: Optional[str] = "90",
        site: Optional[str] = "all",
        activity: Optional[str] = "all",
        lsr: Optional[str] = "all"
    ) -> RiskMatrixResponse:
        query = db.query(RiskObservation)

        if site and site != "all":
            query = query.filter(RiskObservation.facility_id == site)

        if activity and activity != "all":
            query = query.filter(RiskObservation.activity.ilike(f"%{activity}%"))

        if lsr and lsr != "all":
            query = query.filter(RiskObservation.lsr_code.ilike(f"%{lsr}%"))

        observations = query.all()

        # Map observations by (row/consequence, col/frequency)
        cell_map = {}
        for ro in observations:
            key = (ro.consequence_tier, ro.frequency_tier)
            if key not in cell_map:
                cell_map[key] = {"count": 0, "facilities": set()}
            cell_map[key]["count"] += ro.event_count
            if ro.facility_id:
                cell_map[key]["facilities"].add(ro.facility_id)

        consequence_labels = {
            1: "1 Negligible",
            2: "2 Minor",
            3: "3 Moderate",
            4: "4 Major",
            5: "5 Catastrophic"
        }
        likelihood_labels = {
            1: "Rare",
            2: "Unlikely",
            3: "Possible",
            4: "Likely",
            5: "Frequent"
        }

        cells: List[RiskMatrixCellSchema] = []
        total_events = 0

        # Build 5x5 grid (rows 5..1 descending for standard risk matrix, cols 1..5)
        for r in range(5, 0, -1):
            for c in range(1, 6):
                data = cell_map.get((r, c), {"count": 0, "facilities": set()})
                cnt = data["count"]
                total_events += cnt

                if r >= 4 and c >= 4:
                    sev = "Critical"
                elif r >= 4 or (r == 3 and c >= 4):
                    sev = "High"
                elif r >= 3 or c >= 3:
                    sev = "Moderate"
                else:
                    sev = "Low"

                cells.append(
                    RiskMatrixCellSchema(
                        row=r,
                        col=c,
                        consequence=consequence_labels[r],
                        likelihood=likelihood_labels[c],
                        count=cnt,
                        severity=sev,
                        facilityIds=list(data["facilities"])
                    )
                )

        # Calculate causal factors directly from database observations
        causal_factors: List[CausalFactorSchema] = []
        activity_counts = {}
        for ro in observations:
            act = ro.activity.lower()
            activity_counts[act] = activity_counts.get(act, 0) + ro.event_count

        total_obs = max(1, sum(activity_counts.values()))
        color_map = {
            "confined": "#ef4444",
            "isolation": "#f97316",
            "hotwork": "#eab308",
            "height": "#3b82f6",
            "lifting": "#8b5cf6"
        }
        title_map = {
            "confined": "Atmospheric & Confined Space Ingress",
            "isolation": "Energy Isolation & LOTO Deficits",
            "hotwork": "Hot Work & Vapor Ignition Defenses",
            "height": "Work at Height & Fall Restraint",
            "lifting": "Heavy Crane & Rigging Lift Paths"
        }

        for act, cnt in sorted(activity_counts.items(), key=lambda x: x[1], reverse=True):
            pct = int(round((cnt / total_obs) * 100))
            causal_factors.append(
                CausalFactorSchema(
                    label=title_map.get(act, act.capitalize()),
                    percentage=pct,
                    color=color_map.get(act, "#06b6d4"),
                    details=f"{cnt} recorded precursor observations across active facilities."
                )
            )

        return RiskMatrixResponse(
            cells=cells,
            totalEvents=total_events,
            scale=1.0,
            timeframe=timeframe or "90",
            causalFactors=causal_factors
        )

    def get_telemetry(
        self,
        db: Session,
        site: Optional[str] = "all",
        timeframe: Optional[str] = "90"
    ) -> RiskTelemetryResponse:
        facilities = self.get_facilities(db, site=site, timeframe=timeframe)

        if not facilities:
            return RiskTelemetryResponse(
                sites=[],
                totalSites=0,
                criticalCount=0,
                highCount=0,
                averageBarrierIntegrity=0.0
            )

        crit = sum(1 for f in facilities if "critical" in f.riskClassification.lower())
        high = sum(1 for f in facilities if "high" in f.riskClassification.lower())
        avg_barrier = round(sum(f.barrierIntegrityPct for f in facilities) / len(facilities), 1)

        # Derive operational timeline from database SafetyEvent records
        event_query = db.query(SafetyEvent)
        if site and site != "all":
            event_query = event_query.filter(SafetyEvent.facility_id == site)
        events = event_query.order_by(SafetyEvent.created_at.asc()).all()

        timeline: List[RiskTimelinePoint] = []
        for ev in events:
            # SIF risk percentage or consequence-frequency product as risk measurement
            if hasattr(ev, "sif_risk_pct") and getattr(ev, "sif_risk_pct", None) is not None:
                risk_val = float(getattr(ev, "sif_risk_pct"))
            elif ev.consequence is not None and ev.frequency is not None:
                risk_val = float(ev.consequence * ev.frequency * 4.0)
            else:
                risk_val = 0.0
            t_label = str(ev.time) if ev.time else (ev.created_at.strftime("%Y-%m-%d") if ev.created_at else "N/A")
            timeline.append(RiskTimelinePoint(timestamp=t_label, risk=risk_val))

        return RiskTelemetryResponse(
            sites=facilities,
            totalSites=len(facilities),
            criticalCount=crit,
            highCount=high,
            averageBarrierIntegrity=avg_barrier,
            timeline=timeline
        )

    def get_facilities_summary(self, db: Session) -> List[FacilitySummarySchema]:
        db_facilities = db.query(Facility).order_by(Facility.name.asc()).all()
        return [
            FacilitySummarySchema(
                id=f.id,
                code=f.code,
                name=f.name,
                region=f.region,
                type=f.type
            )
            for f in db_facilities
        ]


risk_service = RiskService()
