"""Integration tests for GET /export/summary — counts, is_deleted exclusion, and user scoping."""

from tests.conftest import auth, register_and_login, sync_payments

_BILL_A = {
    "name": "Electric",
    "category": "utilities",
    "frequency": "monthly",
    "amount": 100.00,
    "currency": "PLN",
    "due_day": 10,
    "notes": None,
    "is_paused": False,
}

_BILL_B = {
    "name": "Internet",
    "category": "utilities",
    "frequency": "monthly",
    "amount": 60.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
    "is_paused": False,
}


def test_summary_counts_match_live_data(client):
    tok = register_and_login(client, "summary_counts@test.com")

    r1 = client.post("/bills", json=_BILL_A, headers=auth(tok))
    assert r1.status_code == 201
    r2 = client.post("/bills", json=_BILL_B, headers=auth(tok))
    assert r2.status_code == 201

    sync_payments(client, tok)
    payments = client.get("/bills/payments", headers=auth(tok)).json()

    r = client.get("/export/summary", headers=auth(tok))
    assert r.status_code == 200
    data = r.json()
    assert data["bill_count"] == 2
    assert data["payment_count"] == len(payments)


def test_summary_excludes_deleted_instances(client):
    tok = register_and_login(client, "summary_del@test.com")

    r = client.post("/bills", json=_BILL_A, headers=auth(tok))
    assert r.status_code == 201

    sync_payments(client, tok)
    payments = client.get("/bills/payments", headers=auth(tok)).json()
    assert len(payments) == 1
    instance_id = payments[0]["id"]

    r = client.delete(f"/bills/payments/{instance_id}", headers=auth(tok))
    assert r.status_code == 204

    r = client.get("/export/summary", headers=auth(tok))
    assert r.status_code == 200
    data = r.json()
    assert data["bill_count"] == 1
    assert data["payment_count"] == 0


def test_summary_scoped_to_current_user(client):
    tok_a = register_and_login(client, "summary_a@test.com")
    tok_b = register_and_login(client, "summary_b@test.com")

    r1 = client.post("/bills", json=_BILL_A, headers=auth(tok_a))
    assert r1.status_code == 201
    r2 = client.post("/bills", json=_BILL_B, headers=auth(tok_a))
    assert r2.status_code == 201
    sync_payments(client, tok_a)

    r = client.get("/export/summary", headers=auth(tok_b))
    assert r.status_code == 200
    data = r.json()
    assert data["bill_count"] == 0
    assert data["payment_count"] == 0
