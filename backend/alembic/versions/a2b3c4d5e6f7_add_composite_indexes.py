"""add composite indexes for scheduler and payment queries

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Scheduler queries bill_templates by (user_id, is_archived, is_paused, frequency)
    op.create_index(
        "ix_bill_templates_user_active",
        "bill_templates",
        ["user_id", "is_archived", "is_paused"],
    )
    # list_payments and reminder queries filter payment_instances by (period, is_deleted)
    op.create_index(
        "ix_payment_instance_period_active",
        "payment_instances",
        ["period", "is_deleted"],
    )


def downgrade() -> None:
    op.drop_index("ix_bill_templates_user_active", table_name="bill_templates")
    op.drop_index("ix_payment_instance_period_active", table_name="payment_instances")
