"""add default_currency to users

Revision ID: f5eaa20cbe99
Revises: 85bbb25f965e
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f5eaa20cbe99"
down_revision: Union[str, Sequence[str], None] = "85bbb25f965e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("default_currency", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "default_currency")
