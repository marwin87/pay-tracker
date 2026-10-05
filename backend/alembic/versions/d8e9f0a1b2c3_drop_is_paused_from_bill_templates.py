"""drop is_paused from bill_templates

Revision ID: d8e9f0a1b2c3
Revises: c6d7e8f9a0b1
Create Date: 2026-10-05 12:00:00.000000

"""

from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    A paused bill generated nothing new; keep that by ending it at its last existing
    instance (or this month), never before start_period and never later than an
    end_period it already had.
    """
    conn = op.get_bind()
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    paused = conn.execute(
        sa.text(
            "SELECT id, start_period, end_period FROM bill_templates WHERE is_paused"
        )
    ).all()
    for bill_id, start_period, end_period in paused:
        last = conn.execute(
            sa.text(
                "SELECT max(period) FROM payment_instances "
                "WHERE bill_id = :id AND NOT is_deleted"
            ),
            {"id": bill_id},
        ).scalar()
        new_end = max(last or this_month, start_period or "")
        if end_period:
            new_end = min(new_end, end_period)
        conn.execute(
            sa.text("UPDATE bill_templates SET end_period = :e WHERE id = :id"),
            {"e": new_end, "id": bill_id},
        )
    op.drop_column("bill_templates", "is_paused")


def downgrade() -> None:
    """Downgrade schema. Paused state is not restorable; all bills come back active."""
    op.add_column(
        "bill_templates",
        sa.Column("is_paused", sa.Boolean(), server_default="false", nullable=False),
    )
