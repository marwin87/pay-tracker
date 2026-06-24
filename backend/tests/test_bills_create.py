"""Tests for POST /bills — due_month routing and input validation."""

import pytest

from tests.conftest import auth, register_and_login, sync_payments

_BASE_BILL = {
    "name": "TestBill",
    "category": "utilities",
    "frequency": "monthly",
    "amount": "100.00",
    "currency": "PLN",
    "due_day": 15,
    "is_paused": False,
}


def _bill(**overrides) -> dict:
    return {**_BASE_BILL, **overrides}


# ---------------------------------------------------------------------------
# due_month routing — covers bills.py lines 51-55, 66
# ---------------------------------------------------------------------------


def test_create_monthly_bill_with_past_due_month_seeds_history(client):
    """Monthly bill with due_month 3 months in the past → backfill creates past instances."""
    from datetime import date

    today = date.today()
    if today.month <= 3:
        pytest.skip("Requires at least 3 months of history (month >= April)")

    past_month = today.month - 3
    past_period = f"{today.year}-{past_month:02d}"

    token = register_and_login(client, "backfill_monthly@test.com")
    r = client.post(
        "/bills",
        json=_bill(frequency="monthly", due_month=past_month),
        headers=auth(token),
    )
    assert r.status_code == 201

    r = client.get(f"/bills/payments?month={past_period}", headers=auth(token))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_create_monthly_bill_with_current_month_does_not_backfill(client):
    """Monthly bill with due_month == current month → no backfill (start_period == current)."""
    from datetime import date

    today = date.today()
    token = register_and_login(client, "no_backfill@test.com")
    r = client.post(
        "/bills",
        json=_bill(frequency="monthly", due_month=today.month),
        headers=auth(token),
    )
    assert r.status_code == 201
    bill_id = r.json()["id"]

    # Sync current month — should produce exactly one instance (not extra from backfill)
    sync_payments(client, token)
    payments = client.get("/bills/payments", headers=auth(token)).json()
    bill_payments = [p for p in payments if p["bill_id"] == bill_id]
    assert len(bill_payments) == 1


def test_create_annual_bill_with_future_due_month_sets_next_year(client):
    """Annual bill with due_month > current month → start_period uses current year."""
    from datetime import date

    today = date.today()
    if today.month >= 12:
        pytest.skip("Requires a future month (month < December)")

    future_month = today.month + 1
    token = register_and_login(client, "annual_future@test.com")
    r = client.post(
        "/bills",
        json=_bill(frequency="annual", due_month=future_month, due_day=None),
        headers=auth(token),
    )
    assert r.status_code == 201
    data = r.json()
    # start_period should be current year since due_month >= now.month
    expected_year = today.year
    assert data["start_period"].startswith(str(expected_year))


def test_create_annual_bill_with_past_due_month_sets_next_year(client):
    """Annual bill with due_month < current month → start_period bumped to next year."""
    from datetime import date

    today = date.today()
    if today.month <= 1:
        pytest.skip("Requires a past month (month > January)")

    past_month = today.month - 1
    token = register_and_login(client, "annual_past@test.com")
    r = client.post(
        "/bills",
        json=_bill(frequency="annual", due_month=past_month, due_day=None),
        headers=auth(token),
    )
    assert r.status_code == 201
    data = r.json()
    # start_period should be next year since due_month < now.month
    expected_year = today.year + 1
    assert data["start_period"].startswith(str(expected_year))


# ---------------------------------------------------------------------------
# Input validation — covers 422 paths in Pydantic schema
# ---------------------------------------------------------------------------


def test_create_bill_missing_required_name_returns_422(client):
    token = register_and_login(client, "val_name@test.com")
    payload = {k: v for k, v in _BASE_BILL.items() if k != "name"}
    r = client.post("/bills", json=payload, headers=auth(token))
    assert r.status_code == 422


def test_create_bill_invalid_frequency_returns_422(client):
    token = register_and_login(client, "val_freq@test.com")
    r = client.post("/bills", json=_bill(frequency="weekly"), headers=auth(token))
    assert r.status_code == 422


def test_create_bill_due_day_zero_returns_422(client):
    token = register_and_login(client, "val_day0@test.com")
    r = client.post("/bills", json=_bill(due_day=0), headers=auth(token))
    assert r.status_code == 422


def test_create_bill_due_day_32_returns_422(client):
    token = register_and_login(client, "val_day32@test.com")
    r = client.post("/bills", json=_bill(due_day=32), headers=auth(token))
    assert r.status_code == 422


def test_create_bill_due_month_13_returns_422(client):
    token = register_and_login(client, "val_month13@test.com")
    r = client.post("/bills", json=_bill(due_month=13), headers=auth(token))
    assert r.status_code == 422


def test_create_bill_negative_amount_is_accepted_as_zero_floor(client):
    """amount has no lower-bound validator — Decimal accepts negatives; document the behavior."""
    token = register_and_login(client, "val_neg@test.com")
    r = client.post("/bills", json=_bill(amount="-50.00"), headers=auth(token))
    # Current schema has no non-negative constraint; this test documents that.
    # If a validator is added later, update this to assert 422 instead.
    assert r.status_code == 201


def test_create_bill_invalid_category_returns_422(client):
    token = register_and_login(client, "val_cat@test.com")
    r = client.post("/bills", json=_bill(category="unknown_cat"), headers=auth(token))
    assert r.status_code == 422
