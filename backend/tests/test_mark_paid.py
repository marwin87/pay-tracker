"""Tests for POST /bills/payments/{id}/pay — the `paid_at` date override."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.models.bill import PaymentInstance
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


def _paid_instance(client: TestClient, token: str) -> int:
    instance_id = _instance_id(client, token, _create_bill(client, token))
    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_amount": "100.00", "notes": "first"},
        headers=auth(token),
    )
    assert r.status_code == 200
    return instance_id


def test_edit_paid_payment_updates_and_clears_notes(client_db):
    client, db = client_db
    token = register_and_login(client, "ep1@test.com")
    instance_id = _paid_instance(client, token)

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"paid_amount": "99.50", "notes": "changed"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["paid_amount"] == "99.50"
    assert r.json()["notes"] == "changed"
    assert r.json()["status"] == "paid"

    r = client.patch(
        f"/bills/payments/{instance_id}", json={"notes": ""}, headers=auth(token)
    )
    assert r.json()["notes"] is None
    assert r.json()["paid_amount"] == "99.50"


def test_edit_paid_payment_future_date_and_other_user(client_db):
    client, db = client_db
    token = register_and_login(client, "ep3@test.com")
    instance_id = _paid_instance(client, token)
    future = (date.today() + timedelta(days=2)).isoformat()
    r = client.patch(
        f"/bills/payments/{instance_id}", json={"paid_at": future}, headers=auth(token)
    )
    assert r.status_code == 400

    other = register_and_login(client, "ep4@test.com")
    r = client.patch(
        f"/bills/payments/{instance_id}", json={"notes": "x"}, headers=auth(other)
    )
    assert r.status_code == 403


def _amounts(client: TestClient, token: str, bill_id: int) -> dict:
    period = date.today().strftime("%Y-%m")
    r = client.get(f"/bills/payments?month={period}", headers=auth(token))
    [inst] = [p for p in r.json() if p["bill_id"] == bill_id]
    return inst


def test_unpaid_amount_override_is_per_payment_and_survives_bill_edit(client_db):
    client, db = client_db
    token = register_and_login(client, "ov1@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"amount": "143.20", "notes": "invoice 7"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["amount"] == "143.20"
    assert r.json()["amount_overridden"] is True
    assert r.json()["status"] != "paid"

    # Template is untouched, and a later template price change does not
    # replace this payment's amount.
    assert client.get(f"/bills", headers=auth(token)).json()[0]["amount"] == "120.00"
    r = client.patch(f"/bills/{bill_id}", json={"amount": "200.00"}, headers=auth(token))
    assert r.status_code == 200
    inst = _amounts(client, token, bill_id)
    assert inst["amount"] == "143.20"
    assert inst["notes"] == "invoice 7"

    # Marking paid without a paid_amount defaults to the overridden amount.
    r = client.post(f"/bills/payments/{instance_id}/pay", json={}, headers=auth(token))
    assert r.json()["paid_amount"] == "143.20"
    assert r.json()["amount"] == "143.20"


def test_clearing_amount_override_follows_template_again(client_db):
    client, db = client_db
    token = register_and_login(client, "ov2@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    client.patch(
        f"/bills/payments/{instance_id}", json={"amount": "0"}, headers=auth(token)
    )
    assert _amounts(client, token, bill_id)["amount"] == "0.00"  # note-only reminder

    r = client.patch(
        f"/bills/payments/{instance_id}", json={"amount": None}, headers=auth(token)
    )
    assert r.json()["amount"] == "120.00"
    assert r.json()["amount_overridden"] is False


def test_edit_payment_rejects_fields_of_the_other_state(client_db):
    client, db = client_db
    token = register_and_login(client, "ov3@test.com")
    unpaid_id = _instance_id(client, token, _create_bill(client, token))
    r = client.patch(
        f"/bills/payments/{unpaid_id}", json={"paid_amount": "5"}, headers=auth(token)
    )
    assert r.status_code == 400

    paid_id = _paid_instance(client, token)
    r = client.patch(
        f"/bills/payments/{paid_id}", json={"amount": "5"}, headers=auth(token)
    )
    assert r.status_code == 400


def test_editing_overdue_payment_keeps_overdue_status(client_db):
    client, db = client_db
    token = register_and_login(client, "ov4@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    inst = db.get(PaymentInstance, instance_id)
    inst.due_date = date.today() - timedelta(days=3)
    db.commit()
    assert _amounts(client, token, bill_id)["status"] == "overdue"

    r = client.patch(
        f"/bills/payments/{instance_id}", json={"notes": "x"}, headers=auth(token)
    )
    assert r.json()["status"] == "overdue"
