"""005_add_reviewer_user_id

Revision ID: 005_add_reviewer_user_id
Revises: 004_create_users_table
Create Date: 2026-09-24 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '005_add_reviewer_user_id'
down_revision: Union[str, None] = '004_create_users_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'human_reviews',
        sa.Column('reviewer_user_id', sa.String(length=64), sa.ForeignKey('users.id', name='fk_human_reviews_reviewer_user_id'), nullable=True)
    )
    op.create_index(op.f('ix_human_reviews_reviewer_user_id'), 'human_reviews', ['reviewer_user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_human_reviews_reviewer_user_id'), table_name='human_reviews')
    op.drop_column('human_reviews', 'reviewer_user_id')
