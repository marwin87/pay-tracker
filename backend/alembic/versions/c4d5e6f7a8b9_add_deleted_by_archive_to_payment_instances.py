"""add deleted_by_archive to payment_instances

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-10-08 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "payment_instances",
        sa.Column(
            "deleted_by_archive", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    # Bills archived before this change: hide their unpaid payments from this month on,
    # the same way archiving now does, so unarchiving brings them back.
    op.execute("""
        UPDATE payment_instances
        SET is_deleted = true, deleted_by_archive = true
        WHERE is_deleted = false
          AND status <> 'paid'
          AND period >= to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
          AND bill_id IN (SELECT id FROM bill_templates WHERE is_archived)
        """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payment_instances", "deleted_by_archive")
