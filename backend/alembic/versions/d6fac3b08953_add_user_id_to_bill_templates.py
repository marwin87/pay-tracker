"""add_user_id_to_bill_templates

Revision ID: d6fac3b08953
Revises: 68cc4b807b16
Create Date: 2026-06-15 12:56:23.226008

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d6fac3b08953"
down_revision: Union[str, Sequence[str], None] = "68cc4b807b16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Truncate all per-user data; existing rows have no user_id and cannot
    # be assigned to an owner without arbitrary guessing. Dev/test data only.
    op.execute("TRUNCATE TABLE bill_templates CASCADE")
    op.add_column(
        "bill_templates",
        sa.Column("user_id", sa.Integer(), nullable=False),
    )
    op.create_foreign_key(
        "fk_bill_templates_user_id",
        "bill_templates",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_bill_templates_user_id", "bill_templates", type_="foreignkey"
    )
    op.drop_column("bill_templates", "user_id")
