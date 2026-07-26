from __future__ import annotations

from typing import Callable

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from paytracker.data.models import Base

# Baseline schema version — bump this only via an entry in MIGRATIONS below,
# never by editing this constant alone (a fresh install jumps straight to
# CURRENT_SCHEMA_VERSION via create_all, so it never runs old migrations).
CURRENT_SCHEMA_VERSION = 2


def _add_theme_mode_column(conn: Connection) -> None:
    conn.execute(
        text(
            "ALTER TABLE settings ADD COLUMN theme_mode VARCHAR(6) "
            "NOT NULL DEFAULT 'system'"
        )
    )


# version -> migration function, applied in order to bring an existing DB
# from (version - 1) to version.
MIGRATIONS: dict[int, Callable[[Connection], None]] = {
    2: _add_theme_mode_column,
}


def run_migrations(engine: Engine) -> None:
    with engine.begin() as conn:
        version = conn.execute(text("PRAGMA user_version")).scalar_one()

        if version == 0:
            # Fresh install (or a DB file that predates PRAGMA user_version
            # tracking) — create the full current schema directly rather
            # than replaying history that doesn't apply to an empty file.
            Base.metadata.create_all(bind=conn)
            conn.execute(text(f"PRAGMA user_version = {CURRENT_SCHEMA_VERSION}"))
            return

        for target_version in sorted(v for v in MIGRATIONS if v > version):
            MIGRATIONS[target_version](conn)
            conn.execute(text(f"PRAGMA user_version = {target_version}"))
