"""add indexes for query performance

Revision ID: f1a2b3c4d5e6
Revises: bcd40842a95d
Create Date: 2026-06-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "bcd40842a95d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_payment_instance_user_id_via_join",
        "payment_instances",
        ["bill_id"],
    )
    op.create_index(
        "ix_payment_instance_due_date",
        "payment_instances",
        ["due_date"],
    )
    op.create_index(
        "ix_user_reminder_send_minute",
        "users",
        ["reminder_send_minute"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_payment_instance_user_id_via_join", table_name="payment_instances"
    )
    op.drop_index("ix_payment_instance_due_date", table_name="payment_instances")
    op.drop_index("ix_user_reminder_send_minute", table_name="users")
