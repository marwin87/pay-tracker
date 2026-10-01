"""add per-user time zone

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-10-01 18:00:00.000000

"""

from datetime import datetime
from typing import Sequence, Union
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = "b5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
    )
    zone = settings.default_timezone
    if zone == "UTC":
        return  # nothing to convert: send minutes were UTC and still are

    # Until now the send minutes meant UTC. They now mean the user's local time, so
    # shift them by the zone's current offset: the actual moment of sending stays put
    # today (DST will move it by an hour twice a year, as for any local-time setting).
    offset = datetime.now(ZoneInfo(zone)).utcoffset()
    assert offset is not None
    shift = int(offset.total_seconds() // 60)
    op.get_bind().execute(
        sa.text(
            "UPDATE users SET timezone = :zone,"
            " reminder_send_minute = (reminder_send_minute + :shift + 1440) % 1440,"
            " telegram_send_minute = (telegram_send_minute + :shift + 1440) % 1440"
        ),
        {"zone": zone, "shift": shift},
    )


def downgrade() -> None:
    """Downgrade schema.

    Drops the column only: send minutes stay in the local time they were converted
    to, so after downgrading they are read as UTC again (shifted by the zone offset).
    """
    op.drop_column("users", "timezone")
