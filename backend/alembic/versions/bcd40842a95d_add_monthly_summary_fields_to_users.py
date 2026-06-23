"""add_monthly_summary_fields_to_users

Revision ID: bcd40842a95d
Revises: a1b2c3d4e5f6
Create Date: 2026-06-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bcd40842a95d"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "monthly_summary_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "monthly_summary_last_sent",
            sa.String(7),
            nullable=True,
            server_default=sa.text("null"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "monthly_summary_last_sent")
    op.drop_column("users", "monthly_summary_enabled")
