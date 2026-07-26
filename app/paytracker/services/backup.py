from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from paytracker.data.models import (
    BillCategory,
    BillFrequency,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
    RestoreSnapshot,
)

SCHEMA_VERSION = 3
SUPPORTED_SCHEMA_VERSIONS = {2, 3}
RESTORE_SNAPSHOT_RETENTION_DAYS = 7
MAX_BACKUP_BYTES = 10 * 1024 * 1024  # 10 MB


class BackupValidationError(ValueError):
    """Raised when a backup file is malformed or fails validation."""


def _coerce_category(raw: str | None) -> BillCategory:
    valid = {c.value for c in BillCategory}
    return BillCategory(raw) if raw in valid else BillCategory.other


def build_backup_arrays(db: Session) -> dict:
    """Serialize all bill_templates/payment_instances into the backup shape
    shared by export_json_payload and the pre-restore snapshot."""
    templates = db.query(BillTemplate).all()
    template_ids = [t.id for t in templates]
    instances = (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id.in_(template_ids),
            PaymentInstance.is_deleted.is_(False),
        )
        .all()
        if template_ids
        else []
    )
    return {
        "bill_templates": [
            {
                "id": t.id,
                "name": t.name,
                "category": t.category,
                "frequency": t.frequency,
                "amount": float(t.amount),
                "currency": t.currency,
                "due_day": t.due_day,
                "notes": t.notes,
                "is_archived": t.is_archived,
                "is_paused": t.is_paused,
                "start_period": t.start_period,
                "created_at": t.created_at.isoformat(),
            }
            for t in templates
        ],
        "payment_instances": [
            {
                "id": i.id,
                "bill_id": i.bill_id,
                "period": i.period,
                "due_date": i.due_date.isoformat(),
                "amount": float(i.amount),
                "status": i.status,
                "paid_at": i.paid_at.isoformat() if i.paid_at else None,
                "paid_amount": float(i.paid_amount) if i.paid_amount else None,
                "notes": i.notes,
                "created_at": i.created_at.isoformat(),
                "reminder_sent_upcoming": i.reminder_sent_upcoming,
                "reminder_sent_overdue": i.reminder_sent_overdue,
            }
            for i in instances
        ],
    }


def export_json_payload(db: Session) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        **build_backup_arrays(db),
    }


def export_summary(db: Session) -> dict:
    template_ids = [t.id for t in db.query(BillTemplate.id).all()]
    bill_count = len(template_ids)
    payment_count = (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id.in_(template_ids),
            PaymentInstance.is_deleted.is_(False),
        )
        .count()
        if template_ids
        else 0
    )
    return {"bill_count": bill_count, "payment_count": payment_count}


def validate_backup(raw: dict) -> dict:
    """Structural validation of a parsed backup dict. Raises BackupValidationError
    with a human-readable message on any problem. Returns the validated dict
    unchanged (no Pydantic — manual checks, mirroring the backend's rules)."""
    if not isinstance(raw, dict):
        raise BackupValidationError("Backup file is not a JSON object")

    if raw.get("schema_version") not in SUPPORTED_SCHEMA_VERSIONS:
        raise BackupValidationError("Unsupported schema version")

    templates = raw.get("bill_templates")
    instances = raw.get("payment_instances")
    if not isinstance(templates, list) or not isinstance(instances, list):
        raise BackupValidationError("Backup is missing bill_templates/payment_instances")

    required_template_fields = {"id", "name", "frequency", "amount"}
    for t in templates:
        if not isinstance(t, dict) or not required_template_fields <= t.keys():
            raise BackupValidationError("Malformed bill template in backup")

    required_instance_fields = {"id", "bill_id", "period", "due_date", "amount", "status"}
    for i in instances:
        if not isinstance(i, dict) or not required_instance_fields <= i.keys():
            raise BackupValidationError("Malformed payment instance in backup")

    template_ids = {t["id"] for t in templates}
    orphaned = [i for i in instances if i["bill_id"] not in template_ids]
    if orphaned:
        raise BackupValidationError("Backup contains orphaned payment instances")

    return raw


def apply_backup(db: Session, backup: dict) -> tuple[int, int]:
    """Destructively wipe existing bill_templates/payment_instances and
    re-insert the backup's contents. Shared by restore_from_json and
    restore_from_snapshot. Caller is responsible for db.commit()."""
    db.query(PaymentInstance).delete(synchronize_session=False)
    db.query(BillTemplate).delete(synchronize_session=False)

    id_map: dict[int, int] = {}
    for bt in backup["bill_templates"]:
        template_obj = BillTemplate(
            name=bt["name"],
            category=_coerce_category(bt.get("category")),
            frequency=BillFrequency(bt["frequency"]),
            amount=Decimal(str(bt["amount"])),
            currency=bt.get("currency", "PLN"),
            due_day=bt.get("due_day"),
            notes=bt.get("notes"),
            is_archived=bt.get("is_archived", False),
            is_paused=bt.get("is_paused", False),
            start_period=bt.get("start_period"),
        )
        db.add(template_obj)
        db.flush()
        id_map[bt["id"]] = template_obj.id

    for bi in backup["payment_instances"]:
        instance_obj = PaymentInstance(
            bill_id=id_map[bi["bill_id"]],
            period=bi["period"],
            due_date=date.fromisoformat(bi["due_date"]),
            amount=Decimal(str(bi["amount"])),
            status=PaymentStatus(bi["status"]),
            paid_at=datetime.fromisoformat(bi["paid_at"]) if bi.get("paid_at") else None,
            paid_amount=(
                Decimal(str(bi["paid_amount"])) if bi.get("paid_amount") is not None else None
            ),
            notes=bi.get("notes"),
            reminder_sent_upcoming=bi.get("reminder_sent_upcoming", False),
            reminder_sent_overdue=bi.get("reminder_sent_overdue", False),
        )
        db.add(instance_obj)

    return len(backup["bill_templates"]), len(backup["payment_instances"])


def restore_from_json(db: Session, content: bytes) -> tuple[int, int]:
    if len(content) > MAX_BACKUP_BYTES:
        raise BackupValidationError("Backup file too large (max 10 MB)")

    try:
        raw = json.loads(content)
    except json.JSONDecodeError:
        raise BackupValidationError("Invalid JSON")

    backup = validate_backup(raw)

    has_existing_bills = db.query(BillTemplate.id).first() is not None
    if has_existing_bills:
        snapshot_payload = {"schema_version": SCHEMA_VERSION, **build_backup_arrays(db)}
        db.query(RestoreSnapshot).delete(synchronize_session=False)
        db.add(RestoreSnapshot(payload=snapshot_payload))

    restored_templates, restored_instances = apply_backup(db, backup)
    # Single commit for snapshot write + destructive delete + re-insert: if any
    # of it raises, nothing above commits — do not split this into multiple
    # commits, it would break the "abort restore on snapshot failure" guarantee.
    db.commit()

    return restored_templates, restored_instances


def active_snapshot(db: Session) -> RestoreSnapshot | None:
    """The snapshot if one exists and is still within the retention window."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RESTORE_SNAPSHOT_RETENTION_DAYS)
    return (
        db.query(RestoreSnapshot).filter(RestoreSnapshot.created_at >= cutoff).first()
    )


def restore_from_snapshot(db: Session) -> tuple[int, int]:
    snapshot = active_snapshot(db)
    if snapshot is None:
        raise BackupValidationError("No snapshot to restore")

    backup = validate_backup(snapshot.payload)
    restored_templates, restored_instances = apply_backup(db, backup)
    db.delete(snapshot)
    db.commit()

    return restored_templates, restored_instances
