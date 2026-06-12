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
    elif frequency == BillFrequency.every_2_months:
        month += 2
        while month > 12:
            month -= 12
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


def _bill_active_in_period(template: BillTemplate, period: str) -> bool:
    """Return True if this template's frequency schedule falls on the given period."""
    if template.frequency == BillFrequency.monthly:
        return True

    # Use the creation month as the anchor for the recurrence schedule.
    start_year = template.created_at.year
    start_month = template.created_at.month
    target_year, target_month = map(int, period.split("-"))
    months_diff = (target_year - start_year) * 12 + (target_month - start_month)

    if months_diff < 0:
        return False

    if template.frequency == BillFrequency.every_2_months:
        return months_diff % 2 == 0
    if template.frequency == BillFrequency.quarterly:
        return months_diff % 3 == 0
    if template.frequency == BillFrequency.annual:
        return months_diff % 12 == 0

    return False


def ensure_current_period_instances(db: Session, period: str) -> None:
    """Idempotently seed payment instances for eligible templates that are due in period."""
    templates = (
        db.query(BillTemplate)
        .filter(
            BillTemplate.is_archived.is_(False),
            BillTemplate.is_paused.is_(False),
            BillTemplate.frequency != BillFrequency.one_off,
        )
        .all()
    )
    for template in templates:
        if not _bill_active_in_period(template, period):
            continue
        existing = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id == template.id,
                PaymentInstance.period == period,
            )
            .first()
        )
        if existing:
            continue
        instance = PaymentInstance(
            bill_id=template.id,
            period=period,
            due_date=_due_date_for_period(period, template.due_day),
            amount=template.amount,
            status=PaymentStatus.upcoming,
        )
        db.add(instance)
    db.commit()


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
