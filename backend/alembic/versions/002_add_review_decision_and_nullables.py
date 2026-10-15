"""002_add_review_decision_and_nullables

Revision ID: 002_add_review_decision
Revises: 001_initial_schema
Create Date: 2026-09-24 11:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_add_review_decision'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add review_decision and Phase 3.4 persisted columns to human_reviews
    op.add_column(
        'human_reviews',
        sa.Column('review_decision', sa.String(length=32), nullable=True)
    )
    op.add_column(
        'human_reviews',
        sa.Column('reporter', sa.String(length=128), nullable=True)
    )
    op.add_column(
        'human_reviews',
        sa.Column('primary_lsr', sa.String(length=128), nullable=True)
    )
    op.add_column(
        'human_reviews',
        sa.Column('secondary_lsr', sa.String(length=128), nullable=True)
    )
    op.add_column(
        'human_reviews',
        sa.Column('annotated_tokens', sa.JSON(), nullable=True)
    )
    op.add_column(
        'human_reviews',
        sa.Column('feature_tags', sa.JSON(), nullable=True)
    )
    op.add_column(
        'human_reviews',
        sa.Column('barriers', sa.JSON(), nullable=True)
    )

    # 2. Make operational fields nullable on human_reviews
    op.alter_column('human_reviews', 'ai_sif_level', existing_type=sa.String(length=32), nullable=True)
    op.alter_column('human_reviews', 'ai_sif_score_pct', existing_type=sa.Integer(), nullable=True)
    op.alter_column('human_reviews', 'ai_confidence_pct', existing_type=sa.Integer(), nullable=True)

    # 3. Make operational fields nullable on precursor_patterns
    op.alter_column('precursor_patterns', 'confidence', existing_type=sa.Integer(), nullable=True, server_default=None)
    op.alter_column('precursor_patterns', 'fatal_probability_pct', existing_type=sa.Integer(), nullable=True, server_default=None)

    # 4. Make operational fields nullable on events
    op.alter_column('events', 'consequence', existing_type=sa.Integer(), nullable=True, server_default=None)
    op.alter_column('events', 'frequency', existing_type=sa.Integer(), nullable=True, server_default=None)

    # 5. Make operational fields nullable on risk_observations
    op.alter_column('risk_observations', 'consequence_tier', existing_type=sa.Integer(), nullable=True, server_default=None)
    op.alter_column('risk_observations', 'frequency_tier', existing_type=sa.Integer(), nullable=True, server_default=None)


def downgrade() -> None:
    op.drop_column('human_reviews', 'barriers')
    op.drop_column('human_reviews', 'feature_tags')
    op.drop_column('human_reviews', 'annotated_tokens')
    op.drop_column('human_reviews', 'secondary_lsr')
    op.drop_column('human_reviews', 'primary_lsr')
    op.drop_column('human_reviews', 'reporter')
    op.drop_column('human_reviews', 'review_decision')
