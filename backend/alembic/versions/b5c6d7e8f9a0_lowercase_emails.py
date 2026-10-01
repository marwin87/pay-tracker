"""lowercase emails and enforce case-insensitive uniqueness

Revision ID: b5c6d7e8f9a0
Revises: a7b8c9d0e1f2
Create Date: 2026-10-01 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    dupes = bind.execute(
        sa.text(
            "SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1"
        )
    ).fetchall()
    if dupes:
        # Never merge or overwrite accounts automatically: a human must decide.
        raise RuntimeError(
            "Cannot lowercase emails, these differ only by case: "
            + ", ".join(row[0] for row in dupes)
            + ". Merge or delete the duplicate accounts, then re-run the migration."
        )
    op.execute("UPDATE users SET email = lower(email) WHERE email <> lower(email)")
    op.create_index(
        "uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_users_email_lower", table_name="users")
