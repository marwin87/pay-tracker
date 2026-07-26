"""Tests for payments.has_deleted_future and bills.update_bill's recreate_deleted_future flag.

Ported from backend/tests/test_bill_update_restore.py. Cross-user tests dropped
(no multi-tenancy in a single-user local app).
"""

from datetime import date
from decimal import Decimal

import pytest

from paytracker.data.models import BillCategory, BillFrequency, PaymentInstance, PaymentStatus
from paytracker.services import bills, payments
from paytracker.services.recurrence import _due_date_for_period


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
    db,
    bill_id: int,
    period: str,
    due_date: date,
    status=PaymentStatus.upcoming,
    is_deleted: bool = False,
    amount=Decimal("120.00"),
) -> PaymentInstance:
    inst = PaymentInstance(
        bill_id=bill_id,
        period=period,
        due_date=due_date,
        amount=amount,
        status=status,
        is_deleted=is_deleted,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _current_period() -> str:
    return date.today().strftime("%Y-%m")


def _future_period() -> str:
    today = date.today()
    month = today.month % 12 + 1
    year = today.year + (1 if today.month == 12 else 0)
    return f"{year}-{month:02d}"


def _past_period() -> str:
    today = date.today()
    month = today.month - 1 or 12
    year = today.year - (1 if today.month == 1 else 0)
    return f"{year}-{month:02d}"


# ---------------------------------------------------------------------------
# payments.has_deleted_future
# ---------------------------------------------------------------------------


def test_has_deleted_future_no_instances(db_session):
    bill = _create_bill(db_session)
    assert payments.has_deleted_future(db_session, bill.id) is False


def test_has_deleted_future_with_current_period_tombstone(db_session):
    bill = _create_bill(db_session)
    period = _current_period()
    _insert_instance(db_session, bill.id, period, date.today(), is_deleted=True)

    assert payments.has_deleted_future(db_session, bill.id) is True


def test_has_deleted_future_only_past_tombstone_returns_false(db_session):
    bill = _create_bill(db_session)
    past = _past_period()
    year, month = map(int, past.split("-"))
    _insert_instance(db_session, bill.id, past, date(year, month, 15), is_deleted=True)

    assert payments.has_deleted_future(db_session, bill.id) is False


# ---------------------------------------------------------------------------
# bills.update_bill with recreate_deleted_future=True
# ---------------------------------------------------------------------------


def test_restore_flips_tombstone_to_active(db_session):
    """recreate_deleted_future=True restores is_deleted=False and status=upcoming."""
    bill = _create_bill(db_session)
    period = _current_period()
    inst = _insert_instance(db_session, bill.id, period, date.today(), is_deleted=True)

    bills.update_bill(db_session, bill, {}, recreate_deleted_future=True)

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst.id)
    assert refreshed.is_deleted is False
    assert refreshed.status == PaymentStatus.upcoming


def test_restore_updates_amount(db_session):
    """Restored instances pick up the template's updated amount."""
    bill = _create_bill(db_session)
    period = _current_period()
    inst = _insert_instance(
        db_session, bill.id, period, date.today(), is_deleted=True, amount=Decimal("120.00")
    )

    bills.update_bill(
        db_session, bill, {"amount": Decimal("250.00")}, recreate_deleted_future=True
    )

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst.id)
    assert refreshed.amount == pytest.approx(Decimal("250.00"))


def test_restore_recalculates_due_date(db_session):
    """Restored instances get due_date recalculated from the updated due_day."""
    bill = _create_bill(db_session)  # due_day=15
    period = _current_period()
    year, month = map(int, period.split("-"))
    inst = _insert_instance(
        db_session, bill.id, period, date(year, month, 15), is_deleted=True
    )

    bills.update_bill(db_session, bill, {"due_day": 20}, recreate_deleted_future=True)

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst.id)
    assert refreshed.due_date == _due_date_for_period(period, 20)


def test_update_without_restore_flag_leaves_tombstone_intact(db_session):
    """Default update (recreate_deleted_future=False) does not touch tombstones."""
    bill = _create_bill(db_session)
    period = _current_period()
    inst = _insert_instance(db_session, bill.id, period, date.today(), is_deleted=True)

    bills.update_bill(db_session, bill, {"amount": Decimal("200.00")})

    db_session.expire_all()
    assert db_session.get(PaymentInstance, inst.id).is_deleted is True


def test_restore_no_tombstones_is_noop(db_session):
    """recreate_deleted_future=True with no tombstones: template updated, no error."""
    bill = _create_bill(db_session)
    period = _current_period()
    _insert_instance(db_session, bill.id, period, date.today(), is_deleted=False)

    updated = bills.update_bill(
        db_session, bill, {"amount": Decimal("300.00")}, recreate_deleted_future=True
    )
    assert updated.amount == pytest.approx(Decimal("300.00"))


def test_restore_does_not_restore_past_tombstones(db_session):
    """Past-period tombstones are ignored; only current/future ones are restored."""
    bill = _create_bill(db_session)

    past = _past_period()
    past_year, past_month = map(int, past.split("-"))
    past_inst = _insert_instance(
        db_session, bill.id, past, date(past_year, past_month, 15), is_deleted=True
    )

    future = _future_period()
    future_year, future_month = map(int, future.split("-"))
    future_inst = _insert_instance(
        db_session, bill.id, future, date(future_year, future_month, 15), is_deleted=True
    )

    bills.update_bill(db_session, bill, {}, recreate_deleted_future=True)

    db_session.expire_all()
    assert db_session.get(PaymentInstance, past_inst.id).is_deleted is True  # untouched
    assert db_session.get(PaymentInstance, future_inst.id).is_deleted is False  # restored
