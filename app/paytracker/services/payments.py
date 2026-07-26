from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from paytracker.data.models import PaymentInstance, PaymentStatus
from paytracker.services.recurrence import (
    ensure_current_period_instances,
    generate_next_instance,
)


def effective_status(instance: PaymentInstance, today: date | None = None) -> PaymentStatus:
    """Dynamic overdue: computed at read time, never persisted until acted on."""
    today = today or date.today()
    if instance.status == PaymentStatus.upcoming and instance.due_date < today:
        return PaymentStatus.overdue
    return PaymentStatus(instance.status)


def list_payments(db: Session, month: str | None = None) -> list[PaymentInstance]:
    today = date.today()
    month = month or today.strftime("%Y-%m")
    return (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .filter(
            PaymentInstance.period == month,
            PaymentInstance.is_deleted.is_(False),
        )
        .order_by(PaymentInstance.due_date)
        .all()
    )


def mark_paid(
    db: Session,
    instance: PaymentInstance,
    *,
    paid_amount: Decimal | None = None,
    notes: str | None = None,
) -> PaymentInstance:
    template = instance.template  # read before commit
    instance.status = PaymentStatus.paid
    instance.paid_at = datetime.now(timezone.utc)
    instance.paid_amount = paid_amount if paid_amount is not None else instance.amount
    if notes:
        instance.notes = notes
    db.commit()

    # auto-create next period instance unless template is paused
    if not template.is_paused:
        generate_next_instance(db, template, instance.period)

    db.refresh(instance)
    return instance


def revert_payment(db: Session, instance: PaymentInstance) -> PaymentInstance:
    if instance.status != PaymentStatus.paid:
        raise ValueError("Payment is not marked as paid")

    today = date.today()
    instance.status = (
        PaymentStatus.overdue if instance.due_date < today else PaymentStatus.upcoming
    )
    instance.paid_at = None
    instance.paid_amount = None
    db.commit()
    db.refresh(instance)
    return instance


def delete_payment(
    db: Session, instance: PaymentInstance, *, delete_future: bool = False
) -> None:
    instance.is_deleted = True

    if delete_future:
        db.query(PaymentInstance).filter(
            PaymentInstance.bill_id == instance.bill_id,
            PaymentInstance.due_date > instance.due_date,
            PaymentInstance.status != PaymentStatus.paid,
            PaymentInstance.is_deleted.is_(False),
        ).update({"is_deleted": True}, synchronize_session=False)

    db.commit()


def sync_instances(db: Session, month: str | None = None) -> None:
    """Explicitly seed payment instances for the given month (or current month)."""
    today = date.today()
    current_month = today.strftime("%Y-%m")
    target = month or current_month
    if target >= current_month:
        ensure_current_period_instances(db, target)


def has_deleted_future(db: Session, bill_id: int) -> bool:
    current_period = date.today().strftime("%Y-%m")
    return (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id == bill_id,
            PaymentInstance.is_deleted.is_(True),
            PaymentInstance.period >= current_period,
        )
        .first()
        is not None
    )
