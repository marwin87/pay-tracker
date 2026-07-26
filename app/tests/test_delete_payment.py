"""Tests for payments.delete_payment — single and bulk-future deletion.

Ported from backend/tests/test_delete_payment.py. Cross-user tests dropped
(no multi-tenancy); not-found is a ValueError at the service layer, not an
HTTP 404 (no HTTP layer at this phase).
"""

from datetime import date
from decimal import Decimal

from paytracker.data.models import BillCategory, BillFrequency, PaymentInstance, PaymentStatus
from paytracker.services import bills, payments


def _create_bill(db, **overrides):
    base = dict(
        name="Electricity",
        category=BillCategory.utilities,
        frequency=BillFrequency.monthly,
        amount=Decimal("120.00"),
        currency="PLN",
        due_day=15,
        notes=None,
        is_paused=False,
    )
    base.update(overrides)
    return bills.create_bill(db, **base)


def _insert_instance(
    db, bill_id: int, period: str, due_date: date, status=PaymentStatus.upcoming
) -> PaymentInstance:
    inst = PaymentInstance(
        bill_id=bill_id,
        period=period,
        due_date=due_date,
        amount=Decimal("100.00"),
        status=status,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


# ---------------------------------------------------------------------------
# Single delete (no delete_future)
# ---------------------------------------------------------------------------


def test_delete_single_leaves_other_instances(db_session):
    """Without delete_future only the targeted instance is soft-deleted."""
    bill = _create_bill(db_session)

    i_prev = _insert_instance(db_session, bill.id, "2026-05", date(2026, 5, 15))
    i_target = _insert_instance(db_session, bill.id, "2026-06", date(2026, 6, 15))
    i_next = _insert_instance(db_session, bill.id, "2026-07", date(2026, 7, 15))

    payments.delete_payment(db_session, i_target)

    db_session.expire_all()
    assert db_session.get(PaymentInstance, i_prev.id).is_deleted is False
    assert db_session.get(PaymentInstance, i_target.id).is_deleted is True
    assert db_session.get(PaymentInstance, i_next.id).is_deleted is False


# ---------------------------------------------------------------------------
# delete_future=True
# ---------------------------------------------------------------------------


def test_delete_future_removes_target_and_future_unpaid(db_session):
    """delete_future=True soft-deletes the target and all later unpaid instances."""
    bill = _create_bill(db_session)

    i_past = _insert_instance(db_session, bill.id, "2026-04", date(2026, 4, 15))
    i_target = _insert_instance(db_session, bill.id, "2026-05", date(2026, 5, 15))
    i_future1 = _insert_instance(db_session, bill.id, "2026-06", date(2026, 6, 15))
    i_future2 = _insert_instance(db_session, bill.id, "2026-07", date(2026, 7, 15))

    payments.delete_payment(db_session, i_target, delete_future=True)

    db_session.expire_all()
    assert db_session.get(PaymentInstance, i_past.id).is_deleted is False
    assert db_session.get(PaymentInstance, i_target.id).is_deleted is True
    assert db_session.get(PaymentInstance, i_future1.id).is_deleted is True
    assert db_session.get(PaymentInstance, i_future2.id).is_deleted is True


def test_delete_future_does_not_touch_paid_instances(db_session):
    """Paid future instances must not be soft-deleted."""
    bill = _create_bill(db_session)

    i_target = _insert_instance(db_session, bill.id, "2026-05", date(2026, 5, 15))
    i_paid = _insert_instance(
        db_session, bill.id, "2026-06", date(2026, 6, 15), status=PaymentStatus.paid
    )
    i_upcoming = _insert_instance(db_session, bill.id, "2026-07", date(2026, 7, 15))

    payments.delete_payment(db_session, i_target, delete_future=True)

    db_session.expire_all()
    assert db_session.get(PaymentInstance, i_target.id).is_deleted is True
    assert db_session.get(PaymentInstance, i_paid.id).is_deleted is False
    assert db_session.get(PaymentInstance, i_upcoming.id).is_deleted is True


def test_delete_future_does_not_affect_other_bills(db_session):
    """Instances from a different bill must be untouched."""
    bill_a = _create_bill(db_session)
    bill_b = _create_bill(db_session, name="Water")

    i_a = _insert_instance(db_session, bill_a.id, "2026-05", date(2026, 5, 15))
    i_b_future = _insert_instance(db_session, bill_b.id, "2026-06", date(2026, 6, 15))

    payments.delete_payment(db_session, i_a, delete_future=True)

    db_session.expire_all()
    assert db_session.get(PaymentInstance, i_a.id).is_deleted is True
    assert db_session.get(PaymentInstance, i_b_future.id).is_deleted is False
