"""expand enabled_languages default to new supported languages

Revision ID: 4d5437a90962
Revises: bcd599606922
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "4d5437a90962"
down_revision: Union[str, Sequence[str], None] = "bcd599606922"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_LANGUAGES = ["es", "it", "fr", "zh"]


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "users",
        "enabled_languages",
        server_default="{en,pl,de,es,it,fr,zh}",
    )
    op.execute(
        sa.text(
            "UPDATE users SET enabled_languages = enabled_languages || :new_langs"
        ).bindparams(
            sa.bindparam("new_langs", value=NEW_LANGUAGES, type_=sa.ARRAY(sa.String(5)))
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        sa.text(
            "UPDATE users SET enabled_languages = array(SELECT unnest(enabled_languages) EXCEPT SELECT unnest(:new_langs))"
        ).bindparams(
            sa.bindparam("new_langs", value=NEW_LANGUAGES, type_=sa.ARRAY(sa.String(5)))
        )
    )
    op.alter_column(
        "users",
        "enabled_languages",
        server_default="{en,pl,de}",
    )
