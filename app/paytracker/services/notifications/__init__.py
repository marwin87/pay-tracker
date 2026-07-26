"""Platform-agnostic due-bill/monthly-summary check.

Reuses the exact timing-window semantics and reminder_sent_*/
monthly_summary_last_sent idempotency flags from the old backend's
reminder_job.py — only the delivery mechanism changes (local OS
notification instead of SMTP email), and it fires while the app is
open/foreground rather than from a server-side cron (see notifications/macos.py
and the Phase 4 plan note on why: no tray/background-process API in this
Flet version).
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from paytracker.data.models import BillTemplate, PaymentInstance, PaymentStatus
from paytracker.services.settings import get_settings


@dataclass
class DueReminder:
    instance_id: int
    kind: str  # "2_days_before" | "upcoming" (1 day before) | "on_day" | "overdue" (1 day after)
    flag_attr: str
    bill_name: str
    due_date: date
    amount: Decimal
    currency: str


@dataclass
class MonthlySummary:
    month: str
    paid: list[dict]
    unpaid: list[dict]


def check_due_bills(
    db: Session, today: date | None = None, force: bool = False
) -> list[DueReminder]:
    """Return reminders that are due. By default skips ones already flagged
    as sent (used by the automatic background check, to avoid duplicate
    notifications every 15 minutes). force=True bypasses that flag — used by
    the manual "Check Now" button, which should always show everything due
    regardless of whether it already fired."""
    today = today or date.today()
    settings_row = get_settings(db)
    if not settings_row.notifications_enabled:
        return []

    tomorrow = today + timedelta(days=1)
    two_days_out = today + timedelta(days=2)
    yesterday = today - timedelta(days=1)

    windows: list[tuple[str, date, str]] = []
    if settings_row.notify_2_days_before:
        windows.append(("2_days_before", two_days_out, "reminder_sent_2_days_before"))
    if settings_row.notify_1_day_before:
        windows.append(("upcoming", tomorrow, "reminder_sent_upcoming"))
    if settings_row.notify_on_day:
        windows.append(("on_day", today, "reminder_sent_on_day"))
    if settings_row.notify_1_day_after:
        windows.append(("overdue", yesterday, "reminder_sent_overdue"))

    reminders: list[DueReminder] = []
    for kind, due, flag_attr in windows:
        filters = [
            PaymentInstance.due_date == due,
            PaymentInstance.status != PaymentStatus.paid,
            PaymentInstance.is_deleted.is_(False),
            BillTemplate.is_archived.is_(False),
        ]
        if not force:
            filters.append(getattr(PaymentInstance, flag_attr).is_(False))

        instances = (
            db.query(PaymentInstance)
            .options(selectinload(PaymentInstance.template))
            .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
            .filter(*filters)
            .all()
        )
        for inst in instances:
            reminders.append(
                DueReminder(
                    instance_id=inst.id,
                    kind=kind,
                    flag_attr=flag_attr,
                    bill_name=inst.template.name,
                    due_date=inst.due_date,
                    amount=inst.amount,
                    currency=inst.template.currency,
                )
            )
    return reminders


def mark_reminder_sent(db: Session, instance_id: int, flag_attr: str) -> None:
    inst = db.get(PaymentInstance, instance_id)
    if inst is not None:
        setattr(inst, flag_attr, True)
        db.commit()


def check_monthly_summary(
    db: Session, today: date | None = None, force: bool = False
) -> MonthlySummary | None:
    """force=True (manual "Check Now") bypasses both the last-day-of-month
    gate and the already-sent-this-month gate, same rationale as
    check_due_bills."""
    today = today or date.today()
    settings_row = get_settings(db)
    if not settings_row.monthly_summary_enabled:
        return None

    is_last_day = today.day == calendar.monthrange(today.year, today.month)[1]
    if not is_last_day and not force:
        return None

    current_month = today.strftime("%Y-%m")
    if settings_row.monthly_summary_last_sent == current_month and not force:
        return None

    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            PaymentInstance.period == current_month,
            PaymentInstance.is_deleted.is_(False),
        )
        .all()
    )

    paid, unpaid = [], []
    for inst in instances:
        row = {
            "name": inst.template.name,
            "due_date": inst.due_date,
            "amount": inst.amount,
            "currency": inst.template.currency,
        }
        if inst.status == PaymentStatus.paid:
            row["paid_amount"] = inst.paid_amount
            paid.append(row)
        else:
            unpaid.append(row)

    return MonthlySummary(month=current_month, paid=paid, unpaid=unpaid)


def mark_monthly_summary_sent(db: Session, month: str) -> None:
    settings_row = get_settings(db)
    settings_row.monthly_summary_last_sent = month
    db.commit()
