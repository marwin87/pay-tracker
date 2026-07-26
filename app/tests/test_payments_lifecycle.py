"""Tests for mark_paid/revert_payment — not covered by the ported backend test files
(those exercised the FastAPI routes for this; service-level coverage added here)."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from paytracker.data.models import BillCategory, BillFrequency, PaymentStatus
from paytracker.services import bills, payments


def _create_bill(db, **overrides):
    base = dict(
        name="Internet",
        category=BillCategory.utilities,
        frequency=BillFrequency.monthly,
        amount=Decimal("50.00"),
        currency="PLN",
        due_day=15,
        is_paused=False,
    )
    base.update(overrides)
    return bills.create_bill(db, **base)


def test_mark_paid_defaults_to_template_amount(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]

    result = payments.mark_paid(db_session, inst)

    assert result.status == PaymentStatus.paid
    assert result.paid_amount == Decimal("50.00")
    assert result.paid_at is not None


def test_mark_paid_with_amount_override_and_note(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]

    result = payments.mark_paid(
        db_session, inst, paid_amount=Decimal("45.00"), notes="discount applied"
    )

    assert result.paid_amount == Decimal("45.00")
    assert result.notes == "discount applied"


def test_mark_paid_generates_next_instance_unless_paused(db_session):
    bill = _create_bill(db_session, due_day=1)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]
    period = inst.period

    payments.mark_paid(db_session, inst)

    from paytracker.data.models import PaymentInstance
    from paytracker.services.recurrence import _next_period

    next_period = _next_period(period, BillFrequency.monthly)
    assert (
        db_session.query(PaymentInstance)
        .filter_by(bill_id=bill.id, period=next_period)
        .count()
        == 1
    )


def test_mark_paid_paused_template_does_not_generate_next(db_session):
    bill = _create_bill(db_session, is_paused=True)
    # sync_instances skips paused templates, so seed directly for this test
    from paytracker.data.models import PaymentInstance

    inst = PaymentInstance(
        bill_id=bill.id,
        period=date.today().strftime("%Y-%m"),
        due_date=date.today(),
        amount=bill.amount,
        status=PaymentStatus.upcoming,
    )
    db_session.add(inst)
    db_session.commit()

    payments.mark_paid(db_session, inst)

    assert db_session.query(PaymentInstance).filter_by(bill_id=bill.id).count() == 1


def test_revert_payment_restores_upcoming_when_due_date_in_future(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]
    inst.due_date = date.today() + timedelta(days=5)
    db_session.commit()

    payments.mark_paid(db_session, inst)
    reverted = payments.revert_payment(db_session, inst)

    assert reverted.status == PaymentStatus.upcoming
    assert reverted.paid_at is None
    assert reverted.paid_amount is None


def test_revert_payment_restores_overdue_when_due_date_in_past(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]
    inst.due_date = date.today() - timedelta(days=5)
    db_session.commit()

    payments.mark_paid(db_session, inst)
    reverted = payments.revert_payment(db_session, inst)

    assert reverted.status == PaymentStatus.overdue


def test_revert_payment_not_paid_raises(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]

    with pytest.raises(ValueError):
        payments.revert_payment(db_session, inst)


def test_effective_status_overdue_computed_dynamically(db_session):
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]
    inst.due_date = date.today() - timedelta(days=1)
    db_session.commit()

    # persisted status remains "upcoming" until an action changes it
    assert inst.status == PaymentStatus.upcoming
    assert payments.effective_status(inst) == PaymentStatus.overdue


def test_effective_status_returns_enum_not_raw_db_string(db_session):
    """SQLAlchemy returns the raw column string for `status`, not an enum
    instance — effective_status must coerce it. Callers that do
    `status.value` (e.g. the UI layer) crash on a plain str."""
    bill = _create_bill(db_session)
    payments.sync_instances(db_session)
    inst = payments.list_payments(db_session)[0]
    inst.due_date = date.today() + timedelta(days=5)  # force "upcoming", not overdue
    db_session.commit()

    result = payments.effective_status(inst)

    assert isinstance(result, PaymentStatus)
    assert result.value == "upcoming"
