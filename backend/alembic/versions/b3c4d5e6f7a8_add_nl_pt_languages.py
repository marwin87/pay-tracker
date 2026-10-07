"""add Dutch and Portuguese to enabled_languages

Revision ID: b3c4d5e6f7a8
Revises: e9f0a1b2c3d4
Create Date: 2026-10-07 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_LANGUAGES = ["nl", "pt"]


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "users",
        "enabled_languages",
        server_default="{en,pl,de,es,it,fr,zh,nl,pt}",
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
        server_default="{en,pl,de,es,it,fr,zh}",
    )
