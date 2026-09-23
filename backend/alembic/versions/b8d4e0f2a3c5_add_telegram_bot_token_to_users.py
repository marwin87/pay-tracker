"""add telegram_bot_token to users

Revision ID: b8d4e0f2a3c5
Revises: a7c3d9e1f2b4
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b8d4e0f2a3c5"
down_revision: Union[str, Sequence[str], None] = "a7c3d9e1f2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("telegram_bot_token", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "telegram_bot_token")
