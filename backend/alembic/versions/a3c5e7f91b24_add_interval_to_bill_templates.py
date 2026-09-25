"""add interval to bill_templates; fold every_2_months/quarterly into monthly + interval

Revision ID: a3c5e7f91b24
Revises: e7a1c3d5f902
Create Date: 2026-09-25 00:00:00.000000

Downgrade is lossy: monthly/2 and monthly/3 map back to every_2_months and
quarterly; any other interval (and annual interval > 1) is dropped to 1/default.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a3c5e7f91b24"
down_revision: Union[str, Sequence[str], None] = "e7a1c3d5f902"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bill_templates",
        sa.Column("interval", sa.Integer(), nullable=False, server_default="1"),
    )
    op.execute(
        "UPDATE bill_templates SET frequency = 'monthly', interval = 2 "
        "WHERE frequency = 'every_2_months'"
    )
    op.execute(
        "UPDATE bill_templates SET frequency = 'monthly', interval = 3 "
        "WHERE frequency = 'quarterly'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE bill_templates SET frequency = 'every_2_months' "
        "WHERE frequency = 'monthly' AND interval = 2"
    )
    op.execute(
        "UPDATE bill_templates SET frequency = 'quarterly' "
        "WHERE frequency = 'monthly' AND interval = 3"
    )
    op.drop_column("bill_templates", "interval")
