"""add decimal_separator to users

Revision ID: d1e2f3a4b5c6
Revises: b4d6f8a0c2e1
Create Date: 2026-09-28 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "b4d6f8a0c2e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "decimal_separator",
            sa.String(length=1),
            nullable=False,
            server_default=".",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "decimal_separator")
