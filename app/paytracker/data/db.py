from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from paytracker.data.migrations import run_migrations


def resolve_db_path() -> Path:
    """Where the SQLite file lives.

    Override with PAYTRACKER_DB_PATH (used by tests and dev). Otherwise use
    the standard per-user app-data location for the current OS — macOS is
    the only one implemented today; Windows/Linux get a sane default too so
    dev on those platforms doesn't crash, but aren't the shipping target yet.
    """
    override = os.environ.get("PAYTRACKER_DB_PATH")
    if override:
        return Path(override)

    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "PayTracker"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home())) / "PayTracker"
    else:
        base = Path.home() / ".local" / "share" / "PayTracker"

    base.mkdir(parents=True, exist_ok=True)
    return base / "paytracker.db"


def create_db_engine(db_path: Path | None = None) -> Engine:
    path = db_path or resolve_db_path()
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False},
    )
    run_migrations(engine)
    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)
