"""add_notification_timing_prefs

Revision ID: ba2f1ad53a62
Revises: d7032fd0a99e
Create Date: 2026-06-16 09:50:54.962681

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ba2f1ad53a62"
down_revision: Union[str, Sequence[str], None] = "d7032fd0a99e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # User notification timing preference columns
    op.add_column(
        "users",
        sa.Column(
            "notify_2_days_before",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_1_day_before",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_on_day",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_1_day_after",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    # PaymentInstance sent-flag columns for new timing windows
    op.add_column(
        "payment_instances",
        sa.Column(
            "reminder_sent_2_days_before",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "payment_instances",
        sa.Column(
            "reminder_sent_on_day",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("payment_instances", "reminder_sent_on_day")
    op.drop_column("payment_instances", "reminder_sent_2_days_before")
    op.drop_column("users", "notify_1_day_after")
    op.drop_column("users", "notify_on_day")
    op.drop_column("users", "notify_1_day_before")
    op.drop_column("users", "notify_2_days_before")
