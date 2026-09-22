"""add token_version to users

Revision ID: 85bbb25f965e
Revises: c1d2e3f4a5b6
Create Date: 2026-09-22 17:41:19.734003

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "85bbb25f965e"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Trimmed to just this migration's concern — autogenerate also picked up
    # pre-existing index/constraint naming drift unrelated to token_version
    # (and would have dropped bill_templates' FK ON DELETE CASCADE). Left alone.
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "token_version")
