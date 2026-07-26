"""Tests for services.bills.create_bill — due_month routing and backfill behavior.

Ported from backend/tests/test_bills_create.py. Input-validation (422) cases
are dropped — those exercised the FastAPI/Pydantic HTTP layer, which has no
equivalent yet at the service layer (that's a Phase 2 UI-form-validation
concern, not business logic).
"""

from datetime import date
from decimal import Decimal

import pytest

from paytracker.data.models import BillCategory, BillFrequency
from paytracker.services import bills, payments


def _create(db, **overrides):
    base = dict(
        name="TestBill",
        category=BillCategory.utilities,
        frequency=BillFrequency.monthly,
        amount=Decimal("100.00"),
        currency="PLN",
        due_day=15,
        is_paused=False,
    )
    base.update(overrides)
    return bills.create_bill(db, **base)


def test_create_monthly_bill_with_past_due_month_seeds_history(db_session):
    """Monthly bill with due_month 3 months in the past → backfill creates past instances."""
    today = date.today()
    if today.month <= 3:
        pytest.skip("Requires at least 3 months of history (month >= April)")

    past_month = today.month - 3
    past_period = f"{today.year}-{past_month:02d}"

    bill = _create(db_session, frequency=BillFrequency.monthly, due_month=past_month)

    result = payments.list_payments(db_session, past_period)
    result = [p for p in result if p.bill_id == bill.id]
    assert len(result) == 1


def test_create_monthly_bill_with_current_month_does_not_backfill(db_session):
    """Monthly bill with due_month == current month → no backfill (start_period == current)."""
    today = date.today()
    bill = _create(db_session, frequency=BillFrequency.monthly, due_month=today.month)

    payments.sync_instances(db_session)
    result = [p for p in payments.list_payments(db_session) if p.bill_id == bill.id]
    assert len(result) == 1


def test_create_annual_bill_with_future_due_month_sets_next_year(db_session):
    """Annual bill with due_month > current month → start_period uses current year."""
    today = date.today()
    if today.month >= 12:
        pytest.skip("Requires a future month (month < December)")

    future_month = today.month + 1
    bill = _create(
        db_session,
        frequency=BillFrequency.annual,
        due_month=future_month,
        due_day=None,
    )
    expected_year = today.year
    assert bill.start_period.startswith(str(expected_year))


def test_create_annual_bill_with_past_due_month_sets_next_year(db_session):
    """Annual bill with due_month < current month → start_period bumped to next year."""
    today = date.today()
    if today.month <= 1:
        pytest.skip("Requires a past month (month > January)")

    past_month = today.month - 1
    bill = _create(
        db_session,
        frequency=BillFrequency.annual,
        due_month=past_month,
        due_day=None,
    )
    expected_year = today.year + 1
    assert bill.start_period.startswith(str(expected_year))


def test_create_bill_negative_amount_is_accepted(db_session):
    """amount has no lower-bound check at the service layer — Decimal accepts negatives."""
    bill = _create(db_session, amount=Decimal("-50.00"))
    assert bill.amount == Decimal("-50.00")
