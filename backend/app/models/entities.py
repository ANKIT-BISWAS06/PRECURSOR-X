from datetime import datetime
from typing import Optional, List, Any
from sqlalchemy import (
    String, Integer, Float, Text, Boolean, DateTime, ForeignKey, Index, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..db.base import Base

# Use JSON (which compiles to JSON on SQLite and JSON / JSONB on PostgreSQL)
JsonType = JSON


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    region: Mapped[str] = mapped_column(String(128), index=True)
    type: Mapped[str] = mapped_column(String(128))
    basin: Mapped[str] = mapped_column(String(128))
    active_permits: Mapped[int] = mapped_column(Integer, default=0)
    reports_analyzed: Mapped[int] = mapped_column(Integer, default=0)
    sif_precursors: Mapped[int] = mapped_column(Integer, default=0)
    precursor_delta: Mapped[int] = mapped_column(Integer, default=0)
    precursor_density_pct: Mapped[float] = mapped_column(Float, default=0.0)
    barrier_integrity_pct: Mapped[float] = mapped_column(Float, default=0.0)
    composite_score: Mapped[int] = mapped_column(Integer, default=0)
    trend_30d: Mapped[str] = mapped_column(String(16), default="+0%")
    trend_direction: Mapped[str] = mapped_column(String(16), default="neutral")
    risk_classification: Mapped[str] = mapped_column(String(32), default="Stable", index=True)
    status: Mapped[str] = mapped_column(String(32), default="Nominal")
    activities: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    lsr_codes: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


class SafetyRule(Base):
    __tablename__ = "safety_rules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(32), index=True)
    icon: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(Text)
    incidents_count: Mapped[int] = mapped_column(Integer, default=0)
    percentage: Mapped[int] = mapped_column(Integer, default=0)
    bar_color_class: Mapped[str] = mapped_column(String(64))
    standards_ref: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class SafetyEvent(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    facility_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    facility_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    time: Mapped[str] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(32), index=True)
    vector: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    consequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    frequency: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class SafetyReport(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    unit: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ANALYZED", index=True)
    sif_potential: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sif_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    confidence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    processing_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    analysis_result: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), index=True)


class PrecursorPattern(Base):
    __tablename__ = "precursor_patterns"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    confidence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    observed_recurrence: Mapped[str] = mapped_column(String(128))
    fatal_probability_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vector: Mapped[str] = mapped_column(String(128), index=True)
    lsr_code: Mapped[str] = mapped_column(String(32))
    lsr_title: Mapped[str] = mapped_column(String(128))
    triad: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    genomic_markers: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    pathway_nodes: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class PrecursorObservation(Base):
    __tablename__ = "precursor_observations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pattern_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("precursor_patterns.id", ondelete="CASCADE"), nullable=True, index=True)
    facility_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True, index=True)
    observation_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), index=True)
    shift: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    energy_spike_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    barrier_failed: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    raw_metadata: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)


class RiskObservation(Base):
    __tablename__ = "risk_observations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    facility_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True, index=True)
    activity: Mapped[str] = mapped_column(String(64), index=True)
    lsr_code: Mapped[str] = mapped_column(String(32), index=True)
    consequence_tier: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    frequency_tier: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    event_count: Mapped[int] = mapped_column(Integer, default=1)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class SafetyMemoryRecord(Base):
    __tablename__ = "safety_memory"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    precedent_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    year: Mapped[int] = mapped_column(Integer, index=True)
    facility: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    operational_context: Mapped[str] = mapped_column(Text)
    precursor_signature: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    failed_barriers: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    root_causes: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    corrective_actions: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    consequence_tier: Mapped[str] = mapped_column(String(64))
    lsr_violated: Mapped[str] = mapped_column(String(64), index=True)
    similarity_vector: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class KnowledgeGraphNode(Base):
    __tablename__ = "knowledge_graph_nodes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(32))
    category: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    failure_probability: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    node_metadata: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class KnowledgeGraphEdge(Base):
    __tablename__ = "knowledge_graph_edges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    target: Mapped[str] = mapped_column(String(64), index=True)
    relationship: Mapped[str] = mapped_column(String(64))
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    latency_days: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class Intervention(Base):
    __tablename__ = "interventions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    description: Mapped[str] = mapped_column(Text)
    precursor_pattern: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    targeted_vector: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    lsr_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    lsr_title: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    sif_risk_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    priority: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="Proposed", index=True)
    target_facility: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    affected_sites_summary: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    observed_recurrence: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    protocol_steps: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    owner: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    owner_role: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    due_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    progress_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    verification_metric: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    source_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


class HumanReview(Base):
    __tablename__ = "human_reviews"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    incident_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    site_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    event_time: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="PENDING_REVIEW", index=True)
    review_decision: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ai_sif_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ai_sif_score_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_confidence_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    optical_feed: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    classification_rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specialist_calibration: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    audit_trail: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    reporter: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    primary_lsr: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    secondary_lsr: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    annotated_tokens: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    feature_tags: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    barriers: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    reviewer_user_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("users.id"), nullable=True, index=True)
    reviewer: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class WhatChangedSnapshot(Base):
    __tablename__ = "what_changed_snapshots"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    baseline_period: Mapped[str] = mapped_column(String(64), index=True)
    active_period: Mapped[str] = mapped_column(String(64), index=True)
    precursor_acceleration: Mapped[str] = mapped_column(String(32))
    events_in_active: Mapped[int] = mapped_column(Integer)
    events_in_baseline: Mapped[int] = mapped_column(Integer)
    barrier_integrity_drop: Mapped[str] = mapped_column(String(32))
    baseline_integrity: Mapped[float] = mapped_column(Float)
    current_integrity: Mapped[float] = mapped_column(Float)
    emergent_failure_modes: Mapped[int] = mapped_column(Integer)
    high_energy_spikes: Mapped[int] = mapped_column(Integer)
    key_shift_observation: Mapped[str] = mapped_column(Text)
    divergence_curve: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    flagged_precursors: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(64), default="safety_engineer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
