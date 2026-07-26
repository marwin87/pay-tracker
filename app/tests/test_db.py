"""Tests for the data layer: on-disk engine creation, schema init, migration idempotency."""

from sqlalchemy import create_engine, inspect, text

from paytracker.data.db import create_db_engine, resolve_db_path
from paytracker.data.migrations import CURRENT_SCHEMA_VERSION, run_migrations


def test_resolve_db_path_honors_override(tmp_path, monkeypatch):
    override = tmp_path / "custom" / "paytracker.db"
    monkeypatch.setenv("PAYTRACKER_DB_PATH", str(override))
    assert resolve_db_path() == override


def test_create_db_engine_creates_fresh_schema(tmp_path):
    db_path = tmp_path / "paytracker.db"
    engine = create_db_engine(db_path)

    tables = inspect(engine).get_table_names()
    assert {"bill_templates", "payment_instances", "settings"} <= set(tables)

    with engine.connect() as conn:
        version = conn.execute(text("PRAGMA user_version")).scalar_one()
    assert version == CURRENT_SCHEMA_VERSION


def test_create_db_engine_is_idempotent_on_existing_file(tmp_path):
    db_path = tmp_path / "paytracker.db"
    create_db_engine(db_path)
    # Reopening an already-initialized file must not error or reset data.
    engine2 = create_db_engine(db_path)

    with engine2.connect() as conn:
        version = conn.execute(text("PRAGMA user_version")).scalar_one()
    assert version == CURRENT_SCHEMA_VERSION


def test_migration_adds_theme_mode_to_existing_v1_db_without_losing_data(tmp_path):
    """Regression test for the exact bug reported live: a real user's DB, created
    before theme_mode existed, must gain the column (with existing rows getting
    the default) rather than erroring or requiring the file to be deleted."""
    db_path = tmp_path / "paytracker.db"

    # Build a v1 schema by hand — the settings table exactly as it looked
    # before the theme_mode column was added — and seed one settings row,
    # simulating a real installed app with saved preferences.
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE settings (
                    id INTEGER PRIMARY KEY,
                    language_preference VARCHAR(5),
                    notifications_enabled BOOLEAN NOT NULL DEFAULT 1,
                    notify_2_days_before BOOLEAN NOT NULL DEFAULT 0,
                    notify_1_day_before BOOLEAN NOT NULL DEFAULT 1,
                    notify_on_day BOOLEAN NOT NULL DEFAULT 0,
                    notify_1_day_after BOOLEAN NOT NULL DEFAULT 0,
                    reminder_time VARCHAR(5) NOT NULL DEFAULT '08:00',
                    monthly_summary_enabled BOOLEAN NOT NULL DEFAULT 1,
                    monthly_summary_last_sent VARCHAR(7),
                    launch_at_login BOOLEAN NOT NULL DEFAULT 1
                )
                """
            )
        )
        conn.execute(
            text(
                "INSERT INTO settings (id, language_preference) VALUES (1, 'pl')"
            )
        )
        conn.execute(text("PRAGMA user_version = 1"))
    engine.dispose()

    engine2 = create_engine(f"sqlite:///{db_path}")
    run_migrations(engine2)

    with engine2.connect() as conn:
        version = conn.execute(text("PRAGMA user_version")).scalar_one()
        assert version == CURRENT_SCHEMA_VERSION

        row = conn.execute(
            text("SELECT language_preference, theme_mode FROM settings WHERE id = 1")
        ).one()
        assert row.language_preference == "pl"  # pre-existing data survived
        assert row.theme_mode == "system"  # new column, default applied
