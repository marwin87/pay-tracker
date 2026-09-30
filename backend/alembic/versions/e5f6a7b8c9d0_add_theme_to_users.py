"""add theme to users

Revision ID: e5f6a7b8c9d0
Revises: a3b4c5d6e7f8
Create Date: 2026-09-30 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "theme",
            sa.String(length=20),
            nullable=False,
            server_default="light",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "theme")
