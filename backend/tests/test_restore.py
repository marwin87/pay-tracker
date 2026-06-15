"""Integration tests for POST /export/restore."""

import json

from tests.conftest import auth, register_and_login

_BILL = {
    "name": "Electricity",
    "category": "Utilities",
    "frequency": "monthly",
    "amount": 120.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
    "is_paused": False,
}

_BILL2 = {
    "name": "Internet",
    "category": "Utilities",
    "frequency": "monthly",
    "amount": 50.00,
    "currency": "PLN",
    "due_day": 10,
    "notes": None,
    "is_paused": False,
}


def _upload(client, token, payload):
    return client.post(
        "/export/restore",
        files={
            "file": ("backup.json", json.dumps(payload).encode(), "application/json")
        },
        headers=auth(token),
    )


def _make_backup(templates, instances):
    return {
        "schema_version": 2,
        "exported_by": "test@example.com",
        "exported_at": "2026-01-01T00:00:00+00:00",
        "bill_templates": templates,
        "payment_instances": instances,
    }


def test_restore_happy_path(client):
    tok = register_and_login(client, "a@test.com")

    r = client.post("/bills", json=_BILL, headers=auth(tok))
    assert r.status_code == 201
    client.get("/bills/payments", headers=auth(tok))

    backup = client.get("/export/json", headers=auth(tok)).json()

    r = _upload(client, tok, backup)
    assert r.status_code == 200
    data = r.json()
    assert data["restored_templates"] == len(backup["bill_templates"])
    assert data["restored_instances"] == len(backup["payment_instances"])

    after = client.get("/export/json", headers=auth(tok)).json()
    assert len(after["bill_templates"]) == len(backup["bill_templates"])
    assert len(after["payment_instances"]) == len(backup["payment_instances"])
    assert after["bill_templates"][0]["name"] == backup["bill_templates"][0]["name"]


def test_restore_wrong_schema_version(client):
    tok = register_and_login(client, "a@test.com")
    payload = _make_backup([], [])
    payload["schema_version"] = 1

    r = _upload(client, tok, payload)
    assert r.status_code == 422
    assert "schema version" in r.json()["detail"].lower()


def test_restore_orphaned_instance(client):
    tok = register_and_login(client, "a@test.com")

    r = client.post("/bills", json=_BILL, headers=auth(tok))
    assert r.status_code == 201
    client.get("/bills/payments", headers=auth(tok))

    backup = client.get("/export/json", headers=auth(tok)).json()

    backup["payment_instances"][0]["bill_id"] = 99999

    r = _upload(client, tok, backup)
    assert r.status_code == 422
    assert "orphaned" in r.json()["detail"].lower()


def test_restore_replaces_existing_data(client):
    tok = register_and_login(client, "a@test.com")

    r1 = client.post("/bills", json=_BILL, headers=auth(tok))
    assert r1.status_code == 201
    r2 = client.post("/bills", json=_BILL2, headers=auth(tok))
    assert r2.status_code == 201

    template_id = r1.json()["id"]
    one_template_backup = _make_backup(
        [
            {
                "id": template_id,
                "name": _BILL["name"],
                "category": _BILL["category"],
                "frequency": _BILL["frequency"],
                "amount": _BILL["amount"],
                "currency": _BILL["currency"],
                "due_day": _BILL["due_day"],
                "notes": None,
                "is_archived": False,
                "is_paused": False,
                "start_period": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        ],
        [],
    )

    r = _upload(client, tok, one_template_backup)
    assert r.status_code == 200

    bills = client.get("/bills", headers=auth(tok)).json()
    assert len(bills) == 1
    assert bills[0]["name"] == _BILL["name"]


def test_restore_user_isolation(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    r = client.post("/bills", json=_BILL, headers=auth(tok_a))
    assert r.status_code == 201

    empty_backup = _make_backup([], [])
    r = _upload(client, tok_b, empty_backup)
    assert r.status_code == 200

    bills_a = client.get("/bills", headers=auth(tok_a)).json()
    assert len(bills_a) == 1
    assert bills_a[0]["name"] == _BILL["name"]


def test_restore_requires_auth(client):
    payload = _make_backup([], [])
    r = client.post(
        "/export/restore",
        files={
            "file": ("backup.json", json.dumps(payload).encode(), "application/json")
        },
    )
    assert r.status_code in (401, 403)
