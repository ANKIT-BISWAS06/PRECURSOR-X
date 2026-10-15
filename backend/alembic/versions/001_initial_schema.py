"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-09-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.types import JSON

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Facilities
    op.create_table(
        'facilities',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('region', sa.String(length=128), nullable=False),
        sa.Column('type', sa.String(length=128), nullable=False),
        sa.Column('basin', sa.String(length=128), nullable=False),
        sa.Column('active_permits', sa.Integer(), server_default='0', nullable=False),
        sa.Column('reports_analyzed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('sif_precursors', sa.Integer(), server_default='0', nullable=False),
        sa.Column('precursor_delta', sa.Integer(), server_default='0', nullable=False),
        sa.Column('precursor_density_pct', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('barrier_integrity_pct', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('composite_score', sa.Integer(), server_default='0', nullable=False),
        sa.Column('trend_30d', sa.String(length=16), server_default='+0%', nullable=False),
        sa.Column('trend_direction', sa.String(length=16), server_default='neutral', nullable=False),
        sa.Column('risk_classification', sa.String(length=32), server_default='Stable', nullable=False),
        sa.Column('status', sa.String(length=32), server_default='Nominal', nullable=False),
        sa.Column('activities', JSON(), nullable=True),
        sa.Column('lsr_codes', JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_facilities_code', 'facilities', ['code'], unique=True)
    op.create_index('ix_facilities_region', 'facilities', ['region'])
    op.create_index('ix_facilities_risk_classification', 'facilities', ['risk_classification'])

    # 2. Safety Rules
    op.create_table(
        'safety_rules',
        sa.Column('id', sa.String(length=32), primary_key=True, nullable=False),
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('icon', sa.String(length=64), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('incidents_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('percentage', sa.Integer(), server_default='0', nullable=False),
        sa.Column('bar_color_class', sa.String(length=64), nullable=False),
        sa.Column('standards_ref', sa.String(length=128), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_safety_rules_code', 'safety_rules', ['code'], unique=True)
    op.create_index('ix_safety_rules_category', 'safety_rules', ['category'])

    # 3. Events
    op.create_table(
        'events',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('facility_id', sa.String(length=64), sa.ForeignKey('facilities.id', ondelete='SET NULL'), nullable=True),
        sa.Column('facility_name', sa.String(length=128), nullable=False),
        sa.Column('unit', sa.String(length=128), nullable=False),
        sa.Column('time', sa.String(length=64), nullable=False),
        sa.Column('type', sa.String(length=64), nullable=False),
        sa.Column('severity', sa.String(length=32), nullable=False),
        sa.Column('vector', sa.String(length=128), nullable=False),
        sa.Column('consequence', sa.Integer(), server_default='3', nullable=False),
        sa.Column('frequency', sa.Integer(), server_default='3', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_events_facility_id', 'events', ['facility_id'])
    op.create_index('ix_events_severity', 'events', ['severity'])

    # 4. Reports
    op.create_table(
        'reports',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('unit', sa.String(length=128), nullable=True),
        sa.Column('category', sa.String(length=128), nullable=True),
        sa.Column('status', sa.String(length=32), server_default='ANALYZED', nullable=False),
        sa.Column('sif_potential', sa.String(length=32), nullable=True),
        sa.Column('sif_score', sa.Integer(), nullable=True),
        sa.Column('confidence', sa.Integer(), nullable=True),
        sa.Column('ai_model', sa.String(length=64), nullable=True),
        sa.Column('processing_duration_ms', sa.Integer(), nullable=True),
        sa.Column('analysis_result', JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_reports_status', 'reports', ['status'])
    op.create_index('ix_reports_created_at', 'reports', ['created_at'])

    # 5. Precursor Patterns
    op.create_table(
        'precursor_patterns',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('confidence', sa.Integer(), server_default='85', nullable=False),
        sa.Column('observed_recurrence', sa.String(length=128), nullable=False),
        sa.Column('fatal_probability_pct', sa.Integer(), server_default='50', nullable=False),
        sa.Column('vector', sa.String(length=128), nullable=False),
        sa.Column('lsr_code', sa.String(length=32), nullable=False),
        sa.Column('lsr_title', sa.String(length=128), nullable=False),
        sa.Column('triad', JSON(), nullable=True),
        sa.Column('genomic_markers', JSON(), nullable=True),
        sa.Column('pathway_nodes', JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_precursor_patterns_code', 'precursor_patterns', ['code'], unique=True)
    op.create_index('ix_precursor_patterns_vector', 'precursor_patterns', ['vector'])

    # 6. Precursor Observations
    op.create_table(
        'precursor_observations',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('pattern_id', sa.String(length=64), sa.ForeignKey('precursor_patterns.id', ondelete='CASCADE'), nullable=True),
        sa.Column('facility_id', sa.String(length=64), sa.ForeignKey('facilities.id', ondelete='CASCADE'), nullable=True),
        sa.Column('observation_time', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('shift', sa.String(length=32), nullable=True),
        sa.Column('energy_spike_detected', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('barrier_failed', sa.String(length=128), nullable=True),
        sa.Column('raw_metadata', JSON(), nullable=True)
    )
    op.create_index('ix_precursor_obs_pattern_id', 'precursor_observations', ['pattern_id'])
    op.create_index('ix_precursor_obs_facility_id', 'precursor_observations', ['facility_id'])
    op.create_index('ix_precursor_obs_time', 'precursor_observations', ['observation_time'])

    # 7. Risk Observations
    op.create_table(
        'risk_observations',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('facility_id', sa.String(length=64), sa.ForeignKey('facilities.id', ondelete='CASCADE'), nullable=True),
        sa.Column('activity', sa.String(length=64), nullable=False),
        sa.Column('lsr_code', sa.String(length=32), nullable=False),
        sa.Column('consequence_tier', sa.Integer(), server_default='3', nullable=False),
        sa.Column('frequency_tier', sa.Integer(), server_default='3', nullable=False),
        sa.Column('event_count', sa.Integer(), server_default='1', nullable=False),
        sa.Column('observed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_risk_obs_facility_id', 'risk_observations', ['facility_id'])
    op.create_index('ix_risk_obs_activity', 'risk_observations', ['activity'])
    op.create_index('ix_risk_obs_lsr_code', 'risk_observations', ['lsr_code'])

    # 8. Safety Memory
    op.create_table(
        'safety_memory',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('precedent_code', sa.String(length=64), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('facility', sa.String(length=128), nullable=False),
        sa.Column('operational_context', sa.Text(), nullable=False),
        sa.Column('precursor_signature', sa.String(length=256), nullable=False),
        sa.Column('failed_barriers', JSON(), nullable=True),
        sa.Column('root_causes', JSON(), nullable=True),
        sa.Column('corrective_actions', JSON(), nullable=True),
        sa.Column('consequence_tier', sa.String(length=64), nullable=False),
        sa.Column('lsr_violated', sa.String(length=64), nullable=False),
        sa.Column('similarity_vector', JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_safety_memory_code', 'safety_memory', ['precedent_code'], unique=True)
    op.create_index('ix_safety_memory_year', 'safety_memory', ['year'])
    op.create_index('ix_safety_memory_lsr', 'safety_memory', ['lsr_violated'])

    # 9. Knowledge Graph Nodes
    op.create_table(
        'knowledge_graph_nodes',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('node_id', sa.String(length=64), nullable=False),
        sa.Column('label', sa.String(length=128), nullable=False),
        sa.Column('type', sa.String(length=64), nullable=False),
        sa.Column('severity', sa.String(length=32), nullable=False),
        sa.Column('category', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=32), server_default='ACTIVE', nullable=False),
        sa.Column('failure_probability', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('node_metadata', JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_kg_nodes_node_id', 'knowledge_graph_nodes', ['node_id'], unique=True)
    op.create_index('ix_kg_nodes_type', 'knowledge_graph_nodes', ['type'])

    # 10. Knowledge Graph Edges
    op.create_table(
        'knowledge_graph_edges',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('source', sa.String(length=64), nullable=False),
        sa.Column('target', sa.String(length=64), nullable=False),
        sa.Column('relationship', sa.String(length=64), nullable=False),
        sa.Column('weight', sa.Float(), server_default='1.0', nullable=False),
        sa.Column('latency_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_kg_edges_source', 'knowledge_graph_edges', ['source'])
    op.create_index('ix_kg_edges_target', 'knowledge_graph_edges', ['target'])

    # 11. Interventions
    op.create_table(
        'interventions',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('precursor_pattern', sa.String(length=256), nullable=True),
        sa.Column('targeted_vector', sa.String(length=128), nullable=False),
        sa.Column('lsr_code', sa.String(length=32), nullable=True),
        sa.Column('lsr_title', sa.String(length=128), nullable=True),
        sa.Column('sif_risk_pct', sa.Integer(), server_default='50', nullable=False),
        sa.Column('priority', sa.String(length=32), server_default='Moderate', nullable=False),
        sa.Column('status', sa.String(length=32), server_default='Proposed', nullable=False),
        sa.Column('target_facility', sa.String(length=128), nullable=False),
        sa.Column('affected_sites_summary', sa.String(length=256), nullable=True),
        sa.Column('observed_recurrence', sa.String(length=128), nullable=True),
        sa.Column('protocol_steps', JSON(), nullable=True),
        sa.Column('owner', sa.String(length=128), nullable=False),
        sa.Column('owner_role', sa.String(length=128), nullable=True),
        sa.Column('due_date', sa.String(length=32), nullable=False),
        sa.Column('progress_pct', sa.Integer(), server_default='0', nullable=False),
        sa.Column('verification_metric', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_interventions_code', 'interventions', ['code'], unique=True)
    op.create_index('ix_interventions_priority', 'interventions', ['priority'])
    op.create_index('ix_interventions_status', 'interventions', ['status'])
    op.create_index('ix_interventions_facility', 'interventions', ['target_facility'])

    # 12. Human Reviews
    op.create_table(
        'human_reviews',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('incident_code', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('site_name', sa.String(length=128), nullable=False),
        sa.Column('unit', sa.String(length=128), nullable=False),
        sa.Column('event_time', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=32), server_default='PENDING_REVIEW', nullable=False),
        sa.Column('ai_sif_level', sa.String(length=32), nullable=False),
        sa.Column('ai_sif_score_pct', sa.Integer(), nullable=False),
        sa.Column('ai_confidence_pct', sa.Integer(), nullable=False),
        sa.Column('optical_feed', JSON(), nullable=True),
        sa.Column('classification_rationale', sa.Text(), nullable=False),
        sa.Column('specialist_calibration', JSON(), nullable=True),
        sa.Column('audit_trail', JSON(), nullable=True),
        sa.Column('reviewer', sa.String(length=128), nullable=True),
        sa.Column('reviewer_notes', sa.Text(), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_human_reviews_incident_code', 'human_reviews', ['incident_code'], unique=True)
    op.create_index('ix_human_reviews_status', 'human_reviews', ['status'])

    # 13. What Changed Snapshots
    op.create_table(
        'what_changed_snapshots',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('baseline_period', sa.String(length=64), nullable=False),
        sa.Column('active_period', sa.String(length=64), nullable=False),
        sa.Column('precursor_acceleration', sa.String(length=32), nullable=False),
        sa.Column('events_in_active', sa.Integer(), nullable=False),
        sa.Column('events_in_baseline', sa.Integer(), nullable=False),
        sa.Column('barrier_integrity_drop', sa.String(length=32), nullable=False),
        sa.Column('baseline_integrity', sa.Float(), nullable=False),
        sa.Column('current_integrity', sa.Float(), nullable=False),
        sa.Column('emergent_failure_modes', sa.Integer(), nullable=False),
        sa.Column('high_energy_spikes', sa.Integer(), nullable=False),
        sa.Column('key_shift_observation', sa.Text(), nullable=False),
        sa.Column('divergence_curve', JSON(), nullable=True),
        sa.Column('flagged_precursors', JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_wc_baseline', 'what_changed_snapshots', ['baseline_period'])
    op.create_index('ix_wc_active', 'what_changed_snapshots', ['active_period'])


def downgrade() -> None:
    op.drop_table('what_changed_snapshots')
    op.drop_table('human_reviews')
    op.drop_table('interventions')
    op.drop_table('knowledge_graph_edges')
    op.drop_table('knowledge_graph_nodes')
    op.drop_table('safety_memory')
    op.drop_table('risk_observations')
    op.drop_table('precursor_observations')
    op.drop_table('precursor_patterns')
    op.drop_table('reports')
    op.drop_table('events')
    op.drop_table('safety_rules')
    op.drop_table('facilities')
