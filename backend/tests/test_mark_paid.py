"""Tests for POST /bills/payments/{id}/pay — the `paid_at` date override."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.conftest import auth, category_id, register_and_login

_BILL = {
    "name": "Electricity",
    "frequency": "monthly",
    "amount": "120.00",
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
    "is_paused": False,
}


def _create_bill(client: TestClient, token: str) -> int:
    payload = {**_BILL, "category_id": category_id(client, token)}
    r = client.post("/bills", json=payload, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _instance_id(client: TestClient, token: str, bill_id: int) -> int:
    period = date.today().strftime("%Y-%m")
    client.post(f"/bills/sync-instances?month={period}", headers=auth(token))
    r = client.get(f"/bills/payments?month={period}", headers=auth(token))
    [inst] = [p for p in r.json() if p["bill_id"] == bill_id]
    return inst["id"]


def test_mark_paid_without_date_uses_today(client_db):
    client, db = client_db
    token = register_and_login(client, "mp1@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)

    r = client.post(f"/bills/payments/{instance_id}/pay", json={}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["paid_at"].startswith(date.today().isoformat())


def test_mark_paid_with_past_date_is_recorded(client_db):
    client, db = client_db
    token = register_and_login(client, "mp2@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    past = (date.today() - timedelta(days=5)).isoformat()

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_at": past},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["paid_at"].startswith(past)


def test_mark_paid_with_future_date_rejected(client_db):
    client, db = client_db
    token = register_and_login(client, "mp3@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    future = (date.today() + timedelta(days=1)).isoformat()

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_at": future},
        headers=auth(token),
    )
    assert r.status_code == 400
