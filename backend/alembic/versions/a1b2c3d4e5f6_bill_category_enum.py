"""bill_category_enum

Revision ID: a1b2c3d4e5f6
Revises: 141eca737822
Create Date: 2026-06-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "141eca737822"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE bill_templates
        SET category = 'other'
        WHERE category IS NULL
           OR category NOT IN (
               'housing','utilities','insurance','subscriptions',
               'entertainment','transport','healthcare','education','other'
           )
        """)
    op.alter_column(
        "bill_templates",
        "category",
        existing_type=sa.String(100),
        type_=sa.String(50),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "bill_templates",
        "category",
        existing_type=sa.String(50),
        type_=sa.String(100),
        nullable=True,
    )
