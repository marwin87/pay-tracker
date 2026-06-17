"""Tests for app/services/recurrence.py.

Section 1 (below): pure-function parametrized tests — no DB, no fixtures.
Section 2 (below): DB-backed service tests for generate_next_instance
  and ensure_current_period_instances.

Research: context/changes/testing-recurrence-unit/research.md
"""

import types
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

import app.models.bill  # noqa: F401 — register models with SQLAlchemy's mapper
import app.models.user  # noqa: F401
from app.models.bill import BillFrequency, BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.recurrence import (
    _bill_active_in_period,
    _due_date_for_period,
    _next_period,
    ensure_current_period_instances,
    generate_next_instance,
)

# ── Section 1: pure function tests (no DB) ───────────────────────────────────


@pytest.mark.parametrize(
    "period,frequency,expected",
    [
        # monthly — standard and year rollover
        ("2026-01", BillFrequency.monthly, "2026-02"),
        ("2026-12", BillFrequency.monthly, "2027-01"),
        # every_2_months — rollover cases
        ("2026-11", BillFrequency.every_2_months, "2027-01"),
        ("2026-12", BillFrequency.every_2_months, "2027-02"),
        # quarterly — rollover cases
        ("2026-01", BillFrequency.quarterly, "2026-04"),
        ("2026-10", BillFrequency.quarterly, "2027-01"),
        ("2026-11", BillFrequency.quarterly, "2027-02"),
        ("2026-12", BillFrequency.quarterly, "2027-03"),
        # annual — standard and December
        ("2026-06", BillFrequency.annual, "2027-06"),
        ("2026-12", BillFrequency.annual, "2027-12"),
        # one_off invariant: same period returned unchanged.
        # The guard in generate_next_instance (line 105-106) prevents this
        # path from being reached in production — this test documents the
        # invariant so removing that guard produces a visible failure.
        ("2026-06", BillFrequency.one_off, "2026-06"),
    ],
)
def test_next_period(period: str, frequency: BillFrequency, expected: str) -> None:
    assert _next_period(period, frequency) == expected


@pytest.mark.parametrize(
    "period,due_day,expected",
    [
        # Month-end clamping: expected values are hardcoded dates,
        # never recomputed via calendar.monthrange (oracle problem).
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
    """Lightweight BillTemplate stub for pure-function tests.

    Only populates the three attributes _bill_active_in_period reads:
    frequency, start_period, created_at.
    """
    return types.SimpleNamespace(
        frequency=frequency,
        start_period=start_period,
        created_at=created_at or datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


@pytest.mark.parametrize(
    "frequency,start_period,target_period,expected",
    [
        # monthly is always active (early return, no anchor math)
        (BillFrequency.monthly, "2026-01", "2026-06", True),
        # quarterly — active at anchor, at multiples of 3, inactive otherwise
        (BillFrequency.quarterly, "2026-01", "2026-01", True),  # 0 months offset
        (BillFrequency.quarterly, "2026-01", "2026-04", True),  # +3 months
        (BillFrequency.quarterly, "2026-01", "2026-02", False),  # +1 month
        (BillFrequency.quarterly, "2026-01", "2025-12", False),  # before anchor
        # every_2_months
        (BillFrequency.every_2_months, "2026-01", "2026-03", True),  # +2 months
        (BillFrequency.every_2_months, "2026-01", "2026-02", False),  # +1 month
        # annual
        (BillFrequency.annual, "2026-06", "2027-06", True),  # +12 months
        (BillFrequency.annual, "2026-06", "2027-05", False),  # +11 months
        # one_off: always inactive (fallthrough → False)
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
    """start_period=None falls back to created_at.strftime('%Y-%m') as anchor.

    This covers the backward-compat path (recurrence.py:46) for rows that
    predate the start_period column.  created_at=2026-01-15 → anchor "2026-01".
    """
    template = _stub(
        BillFrequency.quarterly,
        start_period=None,
        created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
    )
    # +3 months from anchor "2026-01" → active
    assert _bill_active_in_period(template, "2026-04") is True
    # +1 month → inactive
    assert _bill_active_in_period(template, "2026-02") is False


# ── Section 2: DB-backed service tests ──────────────────────────────────────


def _make_user(db, email: str = "u@test.com") -> User:
    user = User(email=email, password_hash="x")
    db.add(user)
    db.flush()
    return user


def _make_bill(
    db,
    user_id: int,
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
        user_id=user_id,
    )
    db.add(bill)
    db.flush()
    return bill


def _make_instance(
    db,
    bill_id: int,
    period: str,
    *,
    is_deleted: bool = False,
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
    user = _make_user(db_session)
    bill = _make_bill(
        db_session,
        user.id,
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
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id, frequency=BillFrequency.one_off)
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    result = generate_next_instance(db_session, bill, "2026-05")

    assert result is None
    assert db_session.query(PaymentInstance).filter_by(bill_id=bill_id).count() == 0


def test_generate_next_instance_idempotent(db_session) -> None:
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id)
    bill_id = bill.id
    db_session.commit()

    # First call creates the instance for "2026-06"
    bill = db_session.get(BillTemplate, bill_id)
    first = generate_next_instance(db_session, bill, "2026-05")
    first_id = first.id

    # Second call must return the existing instance — no duplicate
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
    user = _make_user(db_session)
    # due_day=31 in June clamps to 30
    bill = _make_bill(
        db_session,
        user.id,
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


# ── ensure_current_period_instances ──────────────────────────────────────────


def test_ensure_creates_instance_for_active_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_skips_archived_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly, is_archived=True)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_paused_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly, is_paused=True)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_one_off_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.one_off)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_inactive_period(db_session) -> None:
    user = _make_user(db_session)
    # Quarterly from "2026-01": active in 2026-01, 2026-04, 2026-07 ...
    _make_bill(
        db_session, user.id, frequency=BillFrequency.quarterly, start_period="2026-01"
    )
    user_id = user.id
    db_session.commit()

    # "2026-02" is 1 month after anchor → not a quarterly cycle
    ensure_current_period_instances(db_session, "2026-02", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_idempotent(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    # Second call must not produce a duplicate
    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_respects_soft_delete_tombstone(db_session) -> None:
    """A soft-deleted instance (is_deleted=True) acts as a tombstone.

    ensure_current_period_instances must NOT re-generate the instance for
    the same (bill_id, period) — the existing-row check at recurrence.py:87
    fires regardless of is_deleted. lessons.md §4.
    """
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    _make_instance(db_session, bill.id, "2026-06", is_deleted=True)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    # Still exactly 1 row — the tombstone blocked re-creation
    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_scoped_to_user(db_session) -> None:
    user_a = _make_user(db_session, "a@test.com")
    user_b = _make_user(db_session, "b@test.com")
    _make_bill(db_session, user_a.id, frequency=BillFrequency.monthly)
    _make_bill(db_session, user_b.id, frequency=BillFrequency.monthly)
    user_a_id = user_a.id
    user_b_id = user_b.id
    db_session.commit()

    # Seed only for user_a
    ensure_current_period_instances(db_session, "2026-06", user_a_id)

    a_count = (
        db_session.query(PaymentInstance)
        .join(BillTemplate)
        .filter(
            BillTemplate.user_id == user_a_id,
            PaymentInstance.period == "2026-06",
        )
        .count()
    )
    b_count = (
        db_session.query(PaymentInstance)
        .join(BillTemplate)
        .filter(
            BillTemplate.user_id == user_b_id,
            PaymentInstance.period == "2026-06",
        )
        .count()
    )
    assert a_count == 1
    assert b_count == 0
