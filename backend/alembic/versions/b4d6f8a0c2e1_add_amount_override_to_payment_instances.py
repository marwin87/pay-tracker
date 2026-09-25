"""add amount_override to payment_instances

Revision ID: b4d6f8a0c2e1
Revises: a3c5e7f91b24
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b4d6f8a0c2e1"
down_revision: Union[str, Sequence[str], None] = "a3c5e7f91b24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "payment_instances",
        sa.Column("amount_override", sa.Numeric(precision=12, scale=2), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payment_instances", "amount_override")
