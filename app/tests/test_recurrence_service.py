"""Tests for paytracker/services/recurrence.py.

Section 1: pure-function parametrized tests — no DB, no fixtures.
Section 2: DB-backed service tests for generate_next_instance
  and ensure_current_period_instances.

Ported from backend/tests/test_recurrence_service.py — user_id/User scoping
dropped (single-user local app, no multi-tenancy).
"""

import types
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from paytracker.data.models import (
    BillCategory,
    BillFrequency,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)
from paytracker.services.recurrence import (
    _bill_active_in_period,
    _due_date_for_period,
    _next_period,
    backfill_template_instances,
    ensure_current_period_instances,
    generate_next_instance,
)

# ── Section 1: pure function tests (no DB) ───────────────────────────────────


@pytest.mark.parametrize(
    "period,frequency,expected",
    [
        ("2026-01", BillFrequency.monthly, "2026-02"),
        ("2026-12", BillFrequency.monthly, "2027-01"),
        ("2026-11", BillFrequency.every_2_months, "2027-01"),
        ("2026-12", BillFrequency.every_2_months, "2027-02"),
        ("2026-01", BillFrequency.quarterly, "2026-04"),
        ("2026-10", BillFrequency.quarterly, "2027-01"),
        ("2026-11", BillFrequency.quarterly, "2027-02"),
        ("2026-12", BillFrequency.quarterly, "2027-03"),
        ("2026-06", BillFrequency.annual, "2027-06"),
        ("2026-12", BillFrequency.annual, "2027-12"),
        ("2026-06", BillFrequency.one_off, "2026-06"),
    ],
)
def test_next_period(period: str, frequency: BillFrequency, expected: str) -> None:
    assert _next_period(period, frequency) == expected


@pytest.mark.parametrize(
    "period,due_day,expected",
    [
        ("2026-02", 31, date(2026, 2, 28)),  # non-leap February
        ("2024-02", 31, date(2024, 2, 29)),  # leap-year February
        ("2026-04", 31, date(2026, 4, 30)),  # April has 30 days
        ("2026-11", 31, date(2026, 11, 30)),  # November has 30 days
        ("2026-01", 31, date(2026, 1, 31)),  # January 31 is valid
        ("2026-12", 31, date(2026, 12, 31)),  # December 31 is valid
        ("2026-06", 15, date(2026, 6, 15)),  # mid-month, no clamping
        ("2026-06", None, date(2026, 6, 1)),  # None defaults to day 1
    ],
)
def test_due_date_for_period(period: str, due_day: int | None, expected: date) -> None:
    assert _due_date_for_period(period, due_day) == expected


def _stub(
    frequency: BillFrequency,
    start_period: str | None,
    created_at: datetime | None = None,
) -> types.SimpleNamespace:
    return types.SimpleNamespace(
        frequency=frequency,
        start_period=start_period,
        created_at=created_at or datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


@pytest.mark.parametrize(
    "frequency,start_period,target_period,expected",
    [
        (BillFrequency.monthly, "2026-01", "2026-06", True),
        (BillFrequency.quarterly, "2026-01", "2026-01", True),
        (BillFrequency.quarterly, "2026-01", "2026-04", True),
        (BillFrequency.quarterly, "2026-01", "2026-02", False),
        (BillFrequency.quarterly, "2026-01", "2025-12", False),
        (BillFrequency.every_2_months, "2026-01", "2026-03", True),
        (BillFrequency.every_2_months, "2026-01", "2026-02", False),
        (BillFrequency.annual, "2026-06", "2027-06", True),
        (BillFrequency.annual, "2026-06", "2027-05", False),
        (BillFrequency.one_off, "2026-01", "2026-01", False),
    ],
)
def test_bill_active_in_period(
    frequency: BillFrequency,
    start_period: str,
    target_period: str,
    expected: bool,
) -> None:
    template = _stub(frequency, start_period)
    assert _bill_active_in_period(template, target_period) == expected


def test_bill_active_in_period_created_at_fallback() -> None:
    template = _stub(
        BillFrequency.quarterly,
        start_period=None,
        created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
    )
    assert _bill_active_in_period(template, "2026-04") is True
    assert _bill_active_in_period(template, "2026-02") is False


# ── Section 2: DB-backed service tests ──────────────────────────────────────


def _make_bill(
    db,
    *,
    frequency: BillFrequency = BillFrequency.monthly,
    due_day: int = 15,
    amount: Decimal = Decimal("100.00"),
    start_period: str = "2026-01",
    is_paused: bool = False,
    is_archived: bool = False,
) -> BillTemplate:
    bill = BillTemplate(
        name="Test Bill",
        frequency=frequency,
        amount=amount,
        currency="PLN",
        due_day=due_day,
        start_period=start_period,
        is_paused=is_paused,
        is_archived=is_archived,
        category=BillCategory.other,
    )
    db.add(bill)
    db.flush()
    return bill


def _make_instance(
    db, bill_id: int, period: str, *, is_deleted: bool = False
) -> PaymentInstance:
    year, month = int(period[:4]), int(period[5:])
    inst = PaymentInstance(
        bill_id=bill_id,
        period=period,
        due_date=date(year, month, 1),
        amount=Decimal("100.00"),
        status=PaymentStatus.upcoming,
        is_deleted=is_deleted,
    )
    db.add(inst)
    db.flush()
    return inst


# ── generate_next_instance ───────────────────────────────────────────────────


def test_generate_next_instance_monthly_creates_next_period(db_session) -> None:
    bill = _make_bill(
        db_session,
        frequency=BillFrequency.monthly,
        due_day=15,
        start_period="2026-05",
    )
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    instance = generate_next_instance(db_session, bill, "2026-05")

    assert instance is not None
    assert instance.period == "2026-06"
    assert instance.status == PaymentStatus.upcoming
    assert instance.due_date == date(2026, 6, 15)


def test_generate_next_instance_one_off_returns_none(db_session) -> None:
    bill = _make_bill(db_session, frequency=BillFrequency.one_off)
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    result = generate_next_instance(db_session, bill, "2026-05")

    assert result is None
    assert db_session.query(PaymentInstance).filter_by(bill_id=bill_id).count() == 0


def test_generate_next_instance_idempotent(db_session) -> None:
    bill = _make_bill(db_session)
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    first = generate_next_instance(db_session, bill, "2026-05")
    first_id = first.id

    bill = db_session.get(BillTemplate, bill_id)
    second = generate_next_instance(db_session, bill, "2026-05")

    assert second.id == first_id
    count = (
        db_session.query(PaymentInstance)
        .filter_by(bill_id=bill_id, period="2026-06")
        .count()
    )
    assert count == 1


def test_generate_next_instance_copies_amount_and_due_date(db_session) -> None:
    bill = _make_bill(
        db_session,
        frequency=BillFrequency.monthly,
        due_day=31,
        amount=Decimal("150.00"),
    )
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    instance = generate_next_instance(db_session, bill, "2026-05")

    assert instance.amount == Decimal("150.00")
    assert instance.due_date == date(2026, 6, 30)  # June has 30 days


def test_generate_next_instance_integrity_error_fallback(
    db_session, db_sessionmaker
) -> None:
    """Race-condition path: concurrent insert causes IntegrityError → rollback → return winner."""
    bill = _make_bill(db_session, start_period="2026-05")
    bill_id = bill.id
    db_session.commit()

    winner_session = db_sessionmaker()
    winner = PaymentInstance(
        bill_id=bill_id,
        period="2026-06",
        due_date=date(2026, 6, 15),
        amount=Decimal("100.00"),
        status=PaymentStatus.upcoming,
    )
    winner_session.add(winner)
    winner_session.commit()
    winner_id = winner.id
    winner_session.close()

    bill = db_session.get(BillTemplate, bill_id)

    real_query = db_session.query
    pre_check_intercepted = [False]

    def mock_query(model):
        if model is PaymentInstance and not pre_check_intercepted[0]:
            pre_check_intercepted[0] = True
            stub = MagicMock()
            stub.filter.return_value = stub
            stub.first.return_value = None
            return stub
        return real_query(model)

    commit_raised = [False]

    def mock_commit():
        if not commit_raised[0]:
            commit_raised[0] = True
            raise SAIntegrityError("insert", {}, Exception("unique violation"))

    with (
        patch.object(db_session, "query", side_effect=mock_query),
        patch.object(db_session, "commit", side_effect=mock_commit),
    ):
        result = generate_next_instance(db_session, bill, "2026-05")

    assert result is not None
    assert result.id == winner_id


# ── ensure_current_period_instances ──────────────────────────────────────────


def test_ensure_creates_instance_for_active_template(db_session) -> None:
    _make_bill(db_session, frequency=BillFrequency.monthly)
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06")

    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_skips_archived_template(db_session) -> None:
    _make_bill(db_session, frequency=BillFrequency.monthly, is_archived=True)
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06")

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_paused_template(db_session) -> None:
    _make_bill(db_session, frequency=BillFrequency.monthly, is_paused=True)
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06")

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_one_off_template(db_session) -> None:
    _make_bill(db_session, frequency=BillFrequency.one_off)
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06")

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_inactive_period(db_session) -> None:
    # Quarterly from "2026-01": active in 2026-01, 2026-04, 2026-07 ...
    _make_bill(db_session, frequency=BillFrequency.quarterly, start_period="2026-01")
    db_session.commit()

    # "2026-02" is 1 month after anchor → not a quarterly cycle
    ensure_current_period_instances(db_session, "2026-02")

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_idempotent(db_session) -> None:
    _make_bill(db_session, frequency=BillFrequency.monthly)
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06")
    ensure_current_period_instances(db_session, "2026-06")

    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_respects_soft_delete_tombstone(db_session) -> None:
    """A soft-deleted instance (is_deleted=True) acts as a tombstone.

    ensure_current_period_instances must NOT re-generate the instance for
    the same (bill_id, period).
    """
    bill = _make_bill(db_session, frequency=BillFrequency.monthly)
    _make_instance(db_session, bill.id, "2026-06", is_deleted=True)
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06")

    # Still exactly 1 row — the tombstone blocked re-creation
    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


# ── backfill_template_instances ──────────────────────────────────────────────


def test_backfill_creates_instance_for_each_active_period(db_session) -> None:
    """Monthly bill with start_period 3 months back → 3 instances seeded."""
    bill = _make_bill(
        db_session,
        frequency=BillFrequency.monthly,
        due_day=10,
        start_period="2026-01",
    )
    db_session.commit()

    backfill_template_instances(db_session, bill, "2026-01", "2026-03")

    count = db_session.query(PaymentInstance).filter_by(bill_id=bill.id).count()
    assert count == 3

    periods = {
        row.period
        for row in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    }
    assert periods == {"2026-01", "2026-02", "2026-03"}


def test_backfill_is_idempotent(db_session) -> None:
    """Running backfill twice over the same range must not create duplicates."""
    bill = _make_bill(
        db_session, frequency=BillFrequency.monthly, start_period="2026-01"
    )
    db_session.commit()

    backfill_template_instances(db_session, bill, "2026-01", "2026-03")
    backfill_template_instances(db_session, bill, "2026-01", "2026-03")

    assert db_session.query(PaymentInstance).filter_by(bill_id=bill.id).count() == 3


def test_backfill_skips_inactive_periods_for_quarterly(db_session) -> None:
    """Quarterly bill anchored at 2026-01 with range 2026-01..2026-06 → 2 instances."""
    bill = _make_bill(
        db_session, frequency=BillFrequency.quarterly, start_period="2026-01"
    )
    db_session.commit()

    backfill_template_instances(db_session, bill, "2026-01", "2026-06")

    periods = {
        row.period
        for row in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    }
    assert periods == {"2026-01", "2026-04"}
