from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from paytracker.data.models import (
    BillCategory,
    BillFrequency,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)
from paytracker.services.recurrence import (
    _due_date_for_period,
    backfill_template_instances,
)

_RECURRING = (BillFrequency.monthly, BillFrequency.every_2_months, BillFrequency.quarterly)


def create_bill(
    db: Session,
    *,
    name: str,
    category: BillCategory,
    frequency: BillFrequency,
    amount: Decimal,
    currency: str = "PLN",
    due_day: int | None = None,
    due_month: int | None = None,
    notes: str | None = None,
    is_paused: bool = False,
) -> BillTemplate:
    now = datetime.now(timezone.utc)
    if due_month and frequency in (BillFrequency.annual, BillFrequency.one_off):
        year = now.year if due_month >= now.month else now.year + 1
        start_period = f"{year:04d}-{due_month:02d}"
    elif due_month and frequency in _RECURRING:
        start_period = f"{now.year:04d}-{due_month:02d}"
    else:
        start_period = now.strftime("%Y-%m")

    bill = BillTemplate(
        name=name,
        category=category,
        frequency=frequency,
        amount=amount,
        currency=currency,
        due_day=due_day,
        notes=notes,
        is_paused=is_paused,
        start_period=start_period,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)

    current_period = now.strftime("%Y-%m")
    if frequency in _RECURRING and start_period < current_period:
        backfill_template_instances(db, bill, start_period, current_period)

    return bill


def update_bill(
    db: Session,
    bill: BillTemplate,
    updates: dict,
    *,
    due_month: int | None = None,
    recreate_deleted_future: bool = False,
) -> BillTemplate:
    due_day_changed = "due_day" in updates and updates["due_day"] != bill.due_day
    for field, value in updates.items():
        setattr(bill, field, value)

    # Recalculate start_period when due_month changes for annual/one_off
    effective_frequency = updates.get("frequency", bill.frequency)
    if due_month is not None and effective_frequency in (
        BillFrequency.annual,
        BillFrequency.one_off,
    ):
        now = datetime.now(timezone.utc)
        year = now.year if due_month >= now.month else now.year + 1
        bill.start_period = f"{year:04d}-{due_month:02d}"

    if due_day_changed:
        unpaid = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id == bill.id,
                PaymentInstance.status != PaymentStatus.paid,
                PaymentInstance.is_deleted.is_(False),
            )
            .all()
        )
        for inst in unpaid:
            inst.due_date = _due_date_for_period(inst.period, bill.due_day)

    if recreate_deleted_future:
        current_period = date.today().strftime("%Y-%m")
        tombstones = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id == bill.id,
                PaymentInstance.is_deleted.is_(True),
                PaymentInstance.period >= current_period,
            )
            .all()
        )
        for inst in tombstones:
            inst.is_deleted = False
            inst.amount = bill.amount
            inst.due_date = _due_date_for_period(inst.period, bill.due_day)
            inst.status = PaymentStatus.upcoming

    db.commit()
    db.refresh(bill)
    return bill


def archive_bill(db: Session, bill: BillTemplate) -> None:
    bill.is_archived = True
    db.commit()


def list_bills(db: Session, *, include_archived: bool = False) -> list[BillTemplate]:
    q = db.query(BillTemplate)
    if not include_archived:
        q = q.filter(BillTemplate.is_archived.is_(False))
    return q.order_by(BillTemplate.name).all()
