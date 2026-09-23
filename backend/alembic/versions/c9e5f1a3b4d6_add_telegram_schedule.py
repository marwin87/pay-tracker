"""add independent Telegram schedule to users and payment_instances

Revision ID: c9e5f1a3b4d6
Revises: b8d4e0f2a3c5
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c9e5f1a3b4d6"
down_revision: Union[str, Sequence[str], None] = "b8d4e0f2a3c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_USER_BOOLS = [
    ("telegram_reminders_enabled", "true"),
    ("telegram_notify_2_days_before", "false"),
    ("telegram_notify_1_day_before", "true"),
    ("telegram_notify_on_day", "false"),
    ("telegram_notify_1_day_after", "false"),
    ("telegram_monthly_summary_enabled", "true"),
]
_INSTANCE_FLAGS = [
    "telegram_sent_2_days_before",
    "telegram_sent_upcoming",
    "telegram_sent_on_day",
    "telegram_sent_overdue",
]


def upgrade() -> None:
    """Upgrade schema."""
    for name, default in _USER_BOOLS:
        op.add_column(
            "users",
            sa.Column(name, sa.Boolean(), nullable=False, server_default=default),
        )
    op.add_column(
        "users",
        sa.Column(
            "telegram_send_minute", sa.Integer(), nullable=False, server_default="480"
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "telegram_monthly_summary_last_sent", sa.String(length=7), nullable=True
        ),
    )
    for name in _INSTANCE_FLAGS:
        op.add_column(
            "payment_instances",
            sa.Column(name, sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade() -> None:
    """Downgrade schema."""
    for name in _INSTANCE_FLAGS:
        op.drop_column("payment_instances", name)
    op.drop_column("users", "telegram_monthly_summary_last_sent")
    op.drop_column("users", "telegram_send_minute")
    for name, _ in _USER_BOOLS:
        op.drop_column("users", name)
