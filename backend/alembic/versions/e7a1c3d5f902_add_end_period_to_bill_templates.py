"""add end_period to bill_templates

Revision ID: e7a1c3d5f902
Revises: d1f6a2b4c5e7
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e7a1c3d5f902"
down_revision: Union[str, Sequence[str], None] = "d1f6a2b4c5e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "bill_templates", sa.Column("end_period", sa.String(length=7), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("bill_templates", "end_period")
