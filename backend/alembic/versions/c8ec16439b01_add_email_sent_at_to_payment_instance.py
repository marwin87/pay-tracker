"""add email_sent_at to payment_instance

Revision ID: c8ec16439b01
Revises: c4f8e1a2b3d9
Create Date: 2026-06-16 16:23:08.506291

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c8ec16439b01"
down_revision: Union[str, Sequence[str], None] = "c4f8e1a2b3d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_instances",
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payment_instances", "email_sent_at")
