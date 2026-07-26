"""Tests for services.backup — JSON export/restore, pre-restore snapshot + undo.

Ported from backend export.py router behavior (routers/export.py, _apply_backup,
restore_json, restore_from_snapshot). No user_id scoping — single local user.
"""

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from paytracker.data.models import BillCategory, BillFrequency, PaymentStatus, RestoreSnapshot
from paytracker.services import backup, bills, payments


def _create_bill(db, **overrides):
    base = dict(
        name="Electricity",
        category=BillCategory.utilities,
        frequency=BillFrequency.monthly,
        amount=Decimal("120.00"),
        currency="PLN",
        due_day=15,
    )
    base.update(overrides)
    return bills.create_bill(db, **base)


# ── build_backup_arrays / export_json_payload / export_summary ─────────────


def test_build_backup_arrays_excludes_deleted_instances(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]
    payments.delete_payment(db_session, inst)

    arrays = backup.build_backup_arrays(db_session)
    assert arrays["bill_templates"][0]["id"] == bill.id
    assert arrays["payment_instances"] == []


def test_export_json_payload_has_schema_version(db_session):
    _create_bill(db_session)
    payload = backup.export_json_payload(db_session)
    assert payload["schema_version"] == backup.SCHEMA_VERSION
    assert "exported_at" in payload


def test_export_summary_counts(db_session):
    _create_bill(db_session)
    payments.sync_instances(db_session)
    summary = backup.export_summary(db_session)
    assert summary["bill_count"] == 1
    assert summary["payment_count"] == 1


# ── validate_backup ─────────────────────────────────────────────────────────


def test_validate_backup_rejects_unsupported_schema_version():
    with pytest.raises(backup.BackupValidationError):
        backup.validate_backup({"schema_version": 1, "bill_templates": [], "payment_instances": []})


def test_validate_backup_rejects_orphaned_instance():
    raw = {
        "schema_version": 3,
        "bill_templates": [{"id": 1, "name": "X", "frequency": "monthly", "amount": 10}],
        "payment_instances": [
            {
                "id": 1,
                "bill_id": 999,  # not in bill_templates
                "period": "2026-01",
                "due_date": "2026-01-01",
                "amount": 10,
                "status": "upcoming",
            }
        ],
    }
    with pytest.raises(backup.BackupValidationError):
        backup.validate_backup(raw)


def test_validate_backup_accepts_schema_version_2_and_3():
    raw = {"schema_version": 2, "bill_templates": [], "payment_instances": []}
    assert backup.validate_backup(raw)["schema_version"] == 2
    raw3 = {"schema_version": 3, "bill_templates": [], "payment_instances": []}
    assert backup.validate_backup(raw3)["schema_version"] == 3


# ── restore_from_json ────────────────────────────────────────────────────────


def _backup_bytes(templates, instances, schema_version=3) -> bytes:
    return json.dumps(
        {
            "schema_version": schema_version,
            "bill_templates": templates,
            "payment_instances": instances,
        }
    ).encode()


def test_restore_from_json_replaces_existing_data(db_session):
    _create_bill(db_session, name="Old Bill")

    content = _backup_bytes(
        templates=[
            {
                "id": 1,
                "name": "New Bill",
                "category": "housing",
                "frequency": "monthly",
                "amount": 50,
                "currency": "EUR",
                "due_day": 1,
                "notes": None,
                "is_archived": False,
                "is_paused": False,
                "start_period": "2026-01",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
        instances=[],
    )

    restored_templates, restored_instances = backup.restore_from_json(db_session, content)

    assert restored_templates == 1
    assert restored_instances == 0
    remaining = bills.list_bills(db_session)
    assert len(remaining) == 1
    assert remaining[0].name == "New Bill"


def test_restore_from_json_creates_snapshot_when_data_exists(db_session):
    _create_bill(db_session, name="Existing")

    content = _backup_bytes(templates=[], instances=[])
    backup.restore_from_json(db_session, content)

    snapshot = db_session.query(RestoreSnapshot).first()
    assert snapshot is not None
    assert snapshot.payload["bill_templates"][0]["name"] == "Existing"


def test_restore_from_json_no_snapshot_when_starting_empty(db_session):
    content = _backup_bytes(templates=[], instances=[])
    backup.restore_from_json(db_session, content)

    assert db_session.query(RestoreSnapshot).count() == 0


def test_restore_from_json_rejects_oversized_file(db_session):
    huge = b"x" * (backup.MAX_BACKUP_BYTES + 1)
    with pytest.raises(backup.BackupValidationError):
        backup.restore_from_json(db_session, huge)


def test_restore_from_json_rejects_invalid_json(db_session):
    with pytest.raises(backup.BackupValidationError):
        backup.restore_from_json(db_session, b"not json{{{")


# ── active_snapshot / restore_from_snapshot ──────────────────────────────────


def test_active_snapshot_none_when_no_snapshot(db_session):
    assert backup.active_snapshot(db_session) is None


def test_active_snapshot_respects_retention_window(db_session):
    _create_bill(db_session)
    content = _backup_bytes(templates=[], instances=[])
    backup.restore_from_json(db_session, content)

    snapshot = db_session.query(RestoreSnapshot).first()
    snapshot.created_at = datetime.now(timezone.utc) - timedelta(
        days=backup.RESTORE_SNAPSHOT_RETENTION_DAYS + 1
    )
    db_session.commit()

    assert backup.active_snapshot(db_session) is None


def test_restore_from_snapshot_restores_prior_data(db_session):
    _create_bill(db_session, name="Original")
    content = _backup_bytes(templates=[], instances=[])
    backup.restore_from_json(db_session, content)  # wipes to empty, snapshots "Original"

    assert bills.list_bills(db_session) == []

    restored_templates, _ = backup.restore_from_snapshot(db_session)

    assert restored_templates == 1
    remaining = bills.list_bills(db_session)
    assert remaining[0].name == "Original"
    assert db_session.query(RestoreSnapshot).count() == 0  # consumed


def test_restore_from_snapshot_raises_when_none_exists(db_session):
    with pytest.raises(backup.BackupValidationError):
        backup.restore_from_snapshot(db_session)
