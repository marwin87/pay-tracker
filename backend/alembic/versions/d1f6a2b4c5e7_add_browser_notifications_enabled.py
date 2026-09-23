"""add browser_notifications_enabled to users

Revision ID: d1f6a2b4c5e7
Revises: c9e5f1a3b4d6
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d1f6a2b4c5e7"
down_revision: Union[str, Sequence[str], None] = "c9e5f1a3b4d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "browser_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "browser_notifications_enabled")
