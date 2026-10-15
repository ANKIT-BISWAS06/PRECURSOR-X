"""003_intervention_source_and_nullables

Revision ID: 003_intervention_source
Revises: 002_add_review_decision
Create Date: 2026-09-24 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '003_intervention_source'
down_revision: Union[str, None] = '002_add_review_decision'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add source_type and source_record_id lineage columns to interventions
    op.add_column(
        'interventions',
        sa.Column('source_type', sa.String(length=64), nullable=True)
    )
    op.create_index(
        op.f('ix_interventions_source_type'),
        'interventions',
        ['source_type'],
        unique=False
    )
    op.add_column(
        'interventions',
        sa.Column('source_record_id', sa.String(length=64), nullable=True)
    )
    op.create_index(
        op.f('ix_interventions_source_record_id'),
        'interventions',
        ['source_record_id'],
        unique=False
    )

    # 2. Make owner, priority, target_facility, and targeted_vector nullable on interventions
    op.alter_column('interventions', 'owner', existing_type=sa.String(length=128), nullable=True)
    op.alter_column('interventions', 'priority', existing_type=sa.String(length=32), nullable=True, server_default=None)
    op.alter_column('interventions', 'target_facility', existing_type=sa.String(length=128), nullable=True)
    op.alter_column('interventions', 'targeted_vector', existing_type=sa.String(length=128), nullable=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_interventions_source_record_id'), table_name='interventions')
    op.drop_column('interventions', 'source_record_id')
    op.drop_index(op.f('ix_interventions_source_type'), table_name='interventions')
    op.drop_column('interventions', 'source_type')
