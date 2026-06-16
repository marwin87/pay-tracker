"""rename reminder_send_hour to reminder_send_minute

Revision ID: 141eca737822
Revises: c8ec16439b01
Create Date: 2026-06-16 17:10:54.642295

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "141eca737822"
down_revision: Union[str, Sequence[str], None] = "c8ec16439b01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "reminder_send_minute", sa.Integer(), nullable=False, server_default="480"
        ),
    )
    op.execute("UPDATE users SET reminder_send_minute = reminder_send_hour * 60")
    op.drop_column("users", "reminder_send_hour")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "reminder_send_hour", sa.Integer(), nullable=False, server_default="8"
        ),
    )
    op.execute("UPDATE users SET reminder_send_hour = reminder_send_minute / 60")
    op.drop_column("users", "reminder_send_minute")
