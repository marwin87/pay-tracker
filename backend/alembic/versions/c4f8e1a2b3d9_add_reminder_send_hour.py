"""add_reminder_send_hour

Revision ID: c4f8e1a2b3d9
Revises: ba2f1ad53a62
Create Date: 2026-06-16 10:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4f8e1a2b3d9"
down_revision: Union[str, Sequence[str], None] = "ba2f1ad53a62"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "reminder_send_hour",
            sa.Integer(),
            nullable=False,
            server_default="8",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "reminder_send_hour")
