"""add is_deleted to payment_instances

Revision ID: d7032fd0a99e
Revises: 26af8e218f0f
Create Date: 2026-06-16 09:06:13.747652

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d7032fd0a99e"
down_revision: Union[str, Sequence[str], None] = "26af8e218f0f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_instances",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("payment_instances", "is_deleted")
