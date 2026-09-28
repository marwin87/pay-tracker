"""add export settings to users

Revision ID: 489fc47c4e19
Revises: d1e2f3a4b5c6
Create Date: 2026-09-28 18:44:21.562752

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "489fc47c4e19"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "export_enabled", sa.Boolean(), server_default="true", nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "export_fields",
            sa.ARRAY(sa.String(length=20)),
            server_default="{bill,category,period,due_date,amount,currency,status,paid_amount,paid_at,notes}",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "export_fields")
    op.drop_column("users", "export_enabled")
