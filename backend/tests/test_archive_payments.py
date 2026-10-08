"""Archiving hides a bill's unpaid payments from this month on; unarchiving brings back
exactly those, never payments the user deleted by hand."""

from datetime import date

from app.models.bill import PaymentInstance, PaymentStatus
from tests.conftest import auth, category_id, register_and_login, today_utc

_BILL = {
    "name": "Netflix",
    "frequency": "monthly",
    "amount": "50.00",
    "currency": "PLN",
    "due_day": 15,
}


def _period(offset: int) -> str:
    """Period `offset` months from today (negative = past)."""
    t = today_utc()
    idx = t.year * 12 + (t.month - 1) + offset
    return f"{idx // 12}-{idx % 12 + 1:02d}"


def _bill(client, token, **extra) -> int:
    payload = {**_BILL, "category_id": category_id(client, token), **extra}
    r = client.post("/bills", json=payload, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _inst(
    db, bill_id, offset, *, status=PaymentStatus.upcoming, deleted=False
) -> PaymentInstance:
    period = _period(offset)
    y, m = map(int, period.split("-"))
    inst = PaymentInstance(
        bill_id=bill_id,
        period=period,
        due_date=date(y, m, 15),
        amount="50.00",
        status=status,
        is_deleted=deleted,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _listed(client, token, offset) -> list[int]:
    r = client.get(f"/bills/payments?month={_period(offset)}", headers=auth(token))
    assert r.status_code == 200
    return [p["id"] for p in r.json()]


def _archive(client, token, bill_id):
    assert (
        client.post(f"/bills/{bill_id}/archive", headers=auth(token)).status_code == 204
    )


def _unarchive(client, token, bill_id):
    assert (
        client.post(f"/bills/{bill_id}/unarchive", headers=auth(token)).status_code
        == 204
    )


def test_archive_hides_unpaid_from_this_month_but_keeps_history(client_db):
    client, db = client_db
    token = register_and_login(client, "arch1@test.com")
    bill_id = _bill(client, token)
    past_unpaid = _inst(db, bill_id, -1, status=PaymentStatus.overdue)
    paid_now = _inst(db, bill_id, 0, status=PaymentStatus.paid)
    next_unpaid = _inst(db, bill_id, 1)

    _archive(client, token, bill_id)

    assert _listed(client, token, -1) == [past_unpaid.id]  # overdue debt stays visible
    assert _listed(client, token, 0) == [paid_now.id]  # paid history stays
    assert _listed(client, token, 1) == []  # upcoming is hidden


def test_archive_hides_unpaid_payment_of_current_month(client_db):
    client, db = client_db
    token = register_and_login(client, "arch2@test.com")
    bill_id = _bill(client, token)
    now_unpaid = _inst(db, bill_id, 0)

    _archive(client, token, bill_id)

    assert _listed(client, token, 0) == []
    assert now_unpaid.id not in _listed(client, token, 0)


def test_unarchive_restores_what_archive_hid(client_db):
    client, db = client_db
    token = register_and_login(client, "arch3@test.com")
    bill_id = _bill(client, token)
    now_unpaid = _inst(db, bill_id, 0)
    next_unpaid = _inst(db, bill_id, 1)

    _archive(client, token, bill_id)
    _unarchive(client, token, bill_id)

    assert _listed(client, token, 0) == [now_unpaid.id]
    assert _listed(client, token, 1) == [next_unpaid.id]


def test_unarchive_keeps_hand_deleted_payments_deleted(client_db):
    """A payment the user deleted before archiving must not come back on restore."""
    client, db = client_db
    token = register_and_login(client, "arch4@test.com")
    bill_id = _bill(client, token)
    hand_deleted_now = _inst(db, bill_id, 0, deleted=True)
    hand_deleted_next = _inst(db, bill_id, 1, deleted=True)
    archived_later = _inst(db, bill_id, 2)

    _archive(client, token, bill_id)
    _unarchive(client, token, bill_id)

    assert _listed(client, token, 0) == []
    assert _listed(client, token, 1) == []
    assert _listed(client, token, 2) == [archived_later.id]
    db.expire_all()
    assert db.get(PaymentInstance, hand_deleted_now.id).is_deleted is True
    assert db.get(PaymentInstance, hand_deleted_next.id).is_deleted is True


def test_unarchive_does_not_bring_back_months_that_already_passed(client_db):
    client, db = client_db
    token = register_and_login(client, "arch5@test.com")
    bill_id = _bill(client, token)
    inst = _inst(db, bill_id, 0)
    _archive(client, token, bill_id)
    # Time passes while archived: the hidden payment's month is now in the past.
    inst = db.get(PaymentInstance, inst.id)
    inst.period = _period(-1)
    db.commit()

    _unarchive(client, token, bill_id)

    assert _listed(client, token, -1) == []


def test_archive_twice_then_unarchive_is_safe(client_db):
    client, db = client_db
    token = register_and_login(client, "arch6@test.com")
    bill_id = _bill(client, token)
    nxt = _inst(db, bill_id, 1)

    _archive(client, token, bill_id)
    _archive(client, token, bill_id)
    _unarchive(client, token, bill_id)

    assert _listed(client, token, 1) == [nxt.id]


def test_restored_bill_generates_no_duplicate_for_restored_month(client_db):
    client, db = client_db
    token = register_and_login(client, "arch7@test.com")
    bill_id = _bill(client, token)
    now_unpaid = _inst(db, bill_id, 0)

    _archive(client, token, bill_id)
    _unarchive(client, token, bill_id)
    assert (
        client.post(
            f"/bills/sync-instances?month={_period(0)}", headers=auth(token)
        ).status_code
        == 204
    )

    assert _listed(client, token, 0) == [now_unpaid.id]


def test_archived_bill_does_not_regenerate_hidden_months(client_db):
    client, db = client_db
    token = register_and_login(client, "arch8@test.com")
    bill_id = _bill(client, token)
    _inst(db, bill_id, 1)
    _archive(client, token, bill_id)

    assert (
        client.post(
            f"/bills/sync-instances?month={_period(1)}", headers=auth(token)
        ).status_code
        == 204
    )

    assert _listed(client, token, 1) == []


def test_unarchive_clears_a_last_payment_month_in_the_past(client_db):
    client, db = client_db
    token = register_and_login(client, "arch9@test.com")
    bill_id = _bill(client, token, end_period=_period(0))
    bill = client.get("/bills", headers=auth(token)).json()[0]
    assert bill["end_period"] == _period(0)
    # Rewind: the end month is already behind us when the bill is restored.
    from app.models.bill import BillTemplate

    row = db.get(BillTemplate, bill_id)
    row.end_period = _period(-1)
    db.commit()
    _archive(client, token, bill_id)

    _unarchive(client, token, bill_id)

    db.expire_all()
    assert db.get(BillTemplate, bill_id).end_period is None


def test_unarchive_keeps_a_last_payment_month_still_ahead(client_db):
    client, db = client_db
    token = register_and_login(client, "arch10@test.com")
    bill_id = _bill(client, token, end_period=_period(3))
    _archive(client, token, bill_id)

    _unarchive(client, token, bill_id)

    from app.models.bill import BillTemplate

    db.expire_all()
    assert db.get(BillTemplate, bill_id).end_period == _period(3)
