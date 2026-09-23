"""add telegram_chat_id to users

Revision ID: a7c3d9e1f2b4
Revises: 4d5437a90962
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a7c3d9e1f2b4"
down_revision: Union[str, Sequence[str], None] = "4d5437a90962"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("telegram_chat_id", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "telegram_chat_id")
