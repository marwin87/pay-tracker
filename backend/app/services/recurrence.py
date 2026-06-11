from datetime import date
from calendar import monthrange

from sqlalchemy.orm import Session

from app.models.bill import BillFrequency, BillTemplate, PaymentInstance, PaymentStatus


def _next_period(period: str, frequency: BillFrequency) -> str:
    year, month = map(int, period.split("-"))
    if frequency == BillFrequency.monthly:
        month += 1
        if month > 12:
            month = 1
            year += 1
    elif frequency == BillFrequency.quarterly:
        month += 3
        while month > 12:
            month -= 12
            year += 1
    elif frequency == BillFrequency.annual:
        year += 1
    return f"{year:04d}-{month:02d}"


def _due_date_for_period(period: str, due_day: int | None) -> date:
    year, month = map(int, period.split("-"))
    day = due_day or 1
    # clamp to last day of month (e.g. due_day=31 in Feb → 28/29)
    last_day = monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def generate_next_instance(
    db: Session, template: BillTemplate, paid_period: str
) -> PaymentInstance | None:
    """Create the next-period instance after a payment. Idempotent."""
    if template.frequency == BillFrequency.one_off:
        return None

    next_period = _next_period(paid_period, template.frequency)

    # idempotent: skip if already exists
    existing = (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id == template.id,
            PaymentInstance.period == next_period,
        )
        .first()
    )
    if existing:
        return existing

    instance = PaymentInstance(
        bill_id=template.id,
        period=next_period,
        due_date=_due_date_for_period(next_period, template.due_day),
        amount=template.amount,
        status=PaymentStatus.upcoming,
    )
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance
