"""add enabled_languages to users

Revision ID: bcd599606922
Revises: f5eaa20cbe99
Create Date: 2026-09-23 13:12:11.298591

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "bcd599606922"
down_revision: Union[str, Sequence[str], None] = "f5eaa20cbe99"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "enabled_languages",
            sa.ARRAY(sa.String(length=5)),
            server_default="{en,pl,de}",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "enabled_languages")
