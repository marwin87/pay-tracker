import calendar
import io
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import current_user
from app.models.bill import (
    BillFrequency,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)
from app.models.category import Category
from app.models.restore_snapshot import RestoreSnapshot
from app.models.user import User
from app.schemas.bill import (
    BackupChannelSchedule,
    BackupPayload,
    ExportSummaryOut,
    RestoreSnapshotOut,
)
from app.services.categories import seed_default_categories
from app.services.notify import decrypt_secret, encrypt_secret
from app.services.reminder_job import EMAIL, TELEGRAM, Channel
from app.services.recurrence import backfill_template_instances

router = APIRouter(prefix="/export", tags=["export"])


def _legacy_category_id(
    db: Session, user_id: int, slug: str | None, fallback_id: int
) -> int:
    """v2/v3 backups only carry the old free-text category string (now used
    as `slug`). Map it to one of the user's current categories by slug,
    falling back to their 'other' category (or any category at all) if it
    was renamed/archived away."""
    if slug:
        match = (
            db.query(Category.id)
            .filter(Category.user_id == user_id, Category.slug == slug)
            .first()
        )
        if match:
            return match[0]
    return fallback_id


def _fallback_category_id(db: Session, user_id: int) -> int:
    other = (
        db.query(Category.id)
        .filter(Category.user_id == user_id, Category.slug == "other")
        .first()
    )
    if other:
        return other[0]
    any_category = db.query(Category.id).filter(Category.user_id == user_id).first()
    if any_category:
        return any_category[0]
    seeded = seed_default_categories(db, user_id)
    return next(c.id for c in seeded if c.slug == "other")


_COLUMNS = [
    "Bill",
    "Category",
    "Period",
    "Due Date",
    "Amount",
    "Currency",
    "Status",
    "Paid Amount",
    "Paid At",
    "Notes",
]

# Mirrors the per-language dicts already established in
# app/services/reminder_job.py for outbound emails.
_COLUMN_LABELS: dict[str, list[str]] = {
    "en": _COLUMNS,
    "pl": [
        "Rachunek",
        "Kategoria",
        "Okres",
        "Termin płatności",
        "Kwota",
        "Waluta",
        "Status",
        "Kwota zapłacona",
        "Data zapłaty",
        "Notatki",
    ],
    "de": [
        "Rechnung",
        "Kategorie",
        "Zeitraum",
        "Fälligkeitsdatum",
        "Betrag",
        "Währung",
        "Status",
        "Bezahlter Betrag",
        "Bezahlt am",
        "Notizen",
    ],
}

_STATUS_LABELS: dict[str, dict[str, str]] = {
    "en": {"upcoming": "Upcoming", "overdue": "Overdue", "paid": "Paid"},
    "pl": {"upcoming": "Nadchodzące", "overdue": "Zaległe", "paid": "Opłacone"},
    "de": {"upcoming": "Bevorstehend", "overdue": "Überfällig", "paid": "Bezahlt"},
}

_MONTH_ABBR: dict[str, list[str]] = {
    "en": [calendar.month_abbr[m] for m in range(1, 13)],
    "pl": [
        "sty",
        "lut",
        "mar",
        "kwi",
        "maj",
        "cze",
        "lip",
        "sie",
        "wrz",
        "paź",
        "lis",
        "gru",
    ],
    "de": [
        "Jan",
        "Feb",
        "Mär",
        "Apr",
        "Mai",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Okt",
        "Nov",
        "Dez",
    ],
}


def _ensure_year_instances(db: Session, user_id: int, year: int) -> None:
    """Backfill missing payment instances for every eligible template across
    the full year, so export isn't limited to months the user has already
    visited in the UI (list_payments/sync-instances only seed on demand)."""
    templates = (
        db.query(BillTemplate)
        .filter(
            BillTemplate.user_id == user_id,
            BillTemplate.is_archived.is_(False),
            BillTemplate.is_paused.is_(False),
            BillTemplate.frequency != BillFrequency.one_off,
        )
        .all()
    )
    for template in templates:
        backfill_template_instances(db, template, f"{year}-01", f"{year}-12")


@router.get("/xlsx")
def export_xlsx(
    year: int = Query(default_factory=lambda: date.today().year),
    lang: str = Query(default="en"),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    if lang not in _COLUMN_LABELS:
        lang = "en"

    _ensure_year_instances(db, me.id, year)

    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == me.id,
            PaymentInstance.period.startswith(f"{year}-"),
            PaymentInstance.is_deleted.is_(False),
        )
        .order_by(PaymentInstance.due_date)
        .all()
    )

    # Index instances by month number (1–12)
    by_month: dict[int, list[dict]] = {m: [] for m in range(1, 13)}
    for i in instances:
        month = int(i.period[5:7])
        by_month[month].append(
            {
                "Bill": i.template.name,
                "Category": i.template.category.name,
                "Period": i.period,
                "Due Date": i.due_date.isoformat(),
                "Amount": float(i.amount),
                "Currency": i.template.currency,
                "Status": _STATUS_LABELS[lang].get(i.status, i.status),
                "Paid Amount": float(i.paid_amount) if i.paid_amount else None,
                "Paid At": i.paid_at.isoformat() if i.paid_at else None,
                "Notes": i.notes,
            }
        )

    headers = _COLUMN_LABELS[lang]
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for month in range(1, 13):
            sheet_name = f"{_MONTH_ABBR[lang][month - 1]} {year}"
            rows = by_month[month]
            df = (
                pd.DataFrame(rows, columns=_COLUMNS)
                if rows
                else pd.DataFrame(columns=_COLUMNS)
            )
            df.columns = headers
            df.to_excel(writer, index=False, sheet_name=sheet_name)
    buf.seek(0)

    filename = f"pay-tracker-{lang}-{year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


_WINDOW_FIELDS = (
    "notify_2_days_before",
    "notify_1_day_before",
    "notify_on_day",
    "notify_1_day_after",
)


def _schedule_out(user: User, ch: Channel) -> dict:
    out = {
        "enabled": getattr(user, ch.enabled),
        "send_minute": getattr(user, ch.send_minute),
        "monthly_summary_enabled": getattr(user, ch.summary_enabled),
    }
    for field, (_, user_attr, _) in zip(_WINDOW_FIELDS, ch.windows):
        out[field] = getattr(user, user_attr)
    return out


def _apply_schedule(user: User, ch: Channel, s: BackupChannelSchedule) -> None:
    setattr(user, ch.enabled, s.enabled)
    setattr(user, ch.send_minute, s.send_minute)
    setattr(user, ch.summary_enabled, s.monthly_summary_enabled)
    for field, (_, user_attr, _) in zip(_WINDOW_FIELDS, ch.windows):
        setattr(user, user_attr, getattr(s, field))


def _build_backup_arrays(db: Session, user_id: int) -> dict:
    """Serialize a user's categories/bill_templates/payment_instances into the
    backup shape shared by GET /export/json and the pre-restore snapshot."""
    categories = db.query(Category).filter(Category.user_id == user_id).all()
    templates = db.query(BillTemplate).filter(BillTemplate.user_id == user_id).all()
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
    user = db.get(User, user_id)
    assert user is not None
    return {
        "notifications": {
            "email": _schedule_out(user, EMAIL),
            "telegram": _schedule_out(user, TELEGRAM),
            "browser_enabled": user.browser_notifications_enabled,
        },
        "categories": [
            {
                "id": c.id,
                "name": c.name,
                "slug": c.slug,
                "color": c.color,
                "sort_order": c.sort_order,
                "is_default": c.is_default,
                "is_archived": c.is_archived,
            }
            for c in categories
        ],
        "bill_templates": [
            {
                "id": t.id,
                "name": t.name,
                "category_id": t.category_id,
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


@router.get("/json")
def export_json(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    payload = {
        "schema_version": 4,
        "exported_by": me.email,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        **_build_backup_arrays(db, me.id),
    }
    # Not in _build_backup_arrays: that also feeds the DB-stored restore snapshot,
    # which must never hold the bot token in plaintext.
    token = decrypt_secret(me.telegram_bot_token) if me.telegram_bot_token else None
    if token and me.telegram_chat_id:
        payload["telegram"] = {"bot_token": token, "chat_id": me.telegram_chat_id}
    headers = {
        "Content-Disposition": f'attachment; filename="pay-tracker-backup-{datetime.now(timezone.utc).date()}.json"'
    }
    if me.telegram_bot_token_unreadable:
        # Stored but undecryptable (JWT_SECRET changed): the backup can't carry it.
        headers["X-Backup-Warning"] = "telegram-token-unreadable"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers=headers,
    )


@router.get("/summary", response_model=ExportSummaryOut)
def export_summary(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    template_ids = [
        t.id
        for t in db.query(BillTemplate.id).filter(BillTemplate.user_id == me.id).all()
    ]
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
    return ExportSummaryOut(bill_count=bill_count, payment_count=payment_count)


def _apply_backup(db: Session, user_id: int, backup: BackupPayload) -> tuple[int, int]:
    """Destructively wipe a user's existing bill_templates/payment_instances and
    re-insert the backup's contents. Shared by /restore and /restore-snapshot."""
    existing_ids = [
        t.id
        for t in db.query(BillTemplate.id).filter(BillTemplate.user_id == user_id).all()
    ]
    if existing_ids:
        db.query(PaymentInstance).filter(
            PaymentInstance.bill_id.in_(existing_ids)
        ).delete(synchronize_session=False)
        db.query(BillTemplate).filter(BillTemplate.user_id == user_id).delete(
            synchronize_session=False
        )

    category_id_map: dict[int, int] = {}
    if backup.categories:
        db.query(Category).filter(Category.user_id == user_id).delete(
            synchronize_session=False
        )
        for bc in backup.categories:
            category_obj = Category(
                user_id=user_id,
                name=bc.name,
                slug=bc.slug,
                color=bc.color,
                sort_order=bc.sort_order,
                is_default=bc.is_default,
                is_archived=bc.is_archived,
            )
            db.add(category_obj)
            db.flush()
            category_id_map[bc.id] = category_obj.id

    fallback_category_id = _fallback_category_id(db, user_id)

    id_map: dict[int, int] = {}
    for bt in backup.bill_templates:
        if backup.categories:
            category_id = (
                category_id_map.get(bt.category_id, fallback_category_id)
                if bt.category_id is not None
                else fallback_category_id
            )
        else:
            category_id = _legacy_category_id(
                db, user_id, bt.category, fallback_category_id
            )
        template_obj = BillTemplate(
            name=bt.name,
            category_id=category_id,
            frequency=BillFrequency(bt.frequency),
            amount=Decimal(str(bt.amount)),
            currency=bt.currency,
            due_day=bt.due_day,
            notes=bt.notes,
            is_archived=bt.is_archived,
            is_paused=bt.is_paused,
            start_period=bt.start_period,
            user_id=user_id,
        )
        db.add(template_obj)
        db.flush()
        id_map[bt.id] = template_obj.id

    for bi in backup.payment_instances:
        instance_obj = PaymentInstance(
            bill_id=id_map[bi.bill_id],
            period=bi.period,
            due_date=date.fromisoformat(bi.due_date),
            amount=Decimal(str(bi.amount)),
            status=PaymentStatus(bi.status),
            paid_at=datetime.fromisoformat(bi.paid_at) if bi.paid_at else None,
            paid_amount=(
                Decimal(str(bi.paid_amount)) if bi.paid_amount is not None else None
            ),
            notes=bi.notes,
            reminder_sent_upcoming=bi.reminder_sent_upcoming,
            reminder_sent_overdue=bi.reminder_sent_overdue,
        )
        db.add(instance_obj)

    if backup.notifications:  # absent in older backups: keep current settings
        user = db.get(User, user_id)
        assert user is not None
        n = backup.notifications
        if n.email:
            _apply_schedule(user, EMAIL, n.email)
        if n.telegram:
            _apply_schedule(user, TELEGRAM, n.telegram)
        if n.browser_enabled is not None:
            user.browser_notifications_enabled = n.browser_enabled

    return len(backup.bill_templates), len(backup.payment_instances)


@router.post("/restore")
def restore_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    _ALLOWED_TYPES = ("application/json", "text/plain", "application/octet-stream")
    if file.content_type and file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    _MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB
    content = file.file.read(_MAX_UPLOAD + 1)
    if len(content) > _MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Backup file too large (max 10 MB)")
    try:
        raw = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Invalid JSON")

    if raw.get("schema_version") not in {2, 3, 4}:
        raise HTTPException(status_code=422, detail="Unsupported schema version")

    try:
        backup = BackupPayload.model_validate(raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    template_ids_in_backup = {t.id for t in backup.bill_templates}
    orphaned = [
        i for i in backup.payment_instances if i.bill_id not in template_ids_in_backup
    ]
    if orphaned:
        raise HTTPException(
            status_code=422, detail="Backup contains orphaned payment instances"
        )

    has_existing_bills = (
        db.query(BillTemplate.id).filter(BillTemplate.user_id == me.id).first()
        is not None
    )
    if has_existing_bills:
        snapshot_payload = {
            "schema_version": 4,
            **_build_backup_arrays(db, me.id),
        }
        db.query(RestoreSnapshot).filter(RestoreSnapshot.user_id == me.id).delete(
            synchronize_session=False
        )
        db.add(RestoreSnapshot(user_id=me.id, payload=snapshot_payload))

    restored_templates, restored_instances = _apply_backup(db, me.id, backup)
    if backup.telegram:  # absent in older backups: keep the user's current setup
        me.telegram_bot_token = encrypt_secret(backup.telegram.bot_token)
        me.telegram_chat_id = backup.telegram.chat_id
    # Single commit for snapshot write + destructive delete + re-insert: if any
    # of it raises, nothing above commits — do not split this into multiple
    # commits, it would break the "abort restore on snapshot failure" guarantee.
    db.commit()

    return {
        "restored_templates": restored_templates,
        "restored_instances": restored_instances,
    }


def _active_snapshot(db: Session, user_id: int) -> RestoreSnapshot | None:
    """The user's snapshot if one exists and is still within the retention
    window. Shared by /last-snapshot and /restore-snapshot so they can't
    drift on what counts as "expired"."""
    cutoff = datetime.now(timezone.utc) - timedelta(
        days=settings.restore_snapshot_retention_days
    )
    return (
        db.query(RestoreSnapshot)
        .filter(
            RestoreSnapshot.user_id == user_id, RestoreSnapshot.created_at >= cutoff
        )
        .first()
    )


@router.get("/last-snapshot", response_model=RestoreSnapshotOut)
def last_snapshot(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    snapshot = _active_snapshot(db, me.id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No recoverable snapshot")
    return RestoreSnapshotOut(created_at=snapshot.created_at)


@router.post("/restore-snapshot")
def restore_from_snapshot(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    snapshot = _active_snapshot(db, me.id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No snapshot to restore")

    backup = BackupPayload.model_validate(snapshot.payload)
    restored_templates, restored_instances = _apply_backup(db, me.id, backup)
    db.delete(snapshot)
    db.commit()

    return {
        "restored_templates": restored_templates,
        "restored_instances": restored_instances,
    }
