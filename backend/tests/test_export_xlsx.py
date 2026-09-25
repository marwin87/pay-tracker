"""Integration tests for GET /export/xlsx — row count, is_deleted exclusion,
full-year backfill, and language translation."""

import io
from datetime import date

import openpyxl

from tests.conftest import auth, category_id, register_and_login, sync_payments

_BILL_A = {
    "name": "Electric",
    "frequency": "monthly",
    "amount": 100.00,
    "currency": "PLN",
    "due_day": 10,
    "notes": None,
    "is_paused": False,
}

_BILL_B = {
    "name": "Internet",
    "frequency": "monthly",
    "amount": 60.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
    "is_paused": False,
}


def _data_rows(xlsx_bytes: bytes) -> int:
    """Count total data rows (excluding header) across all sheets in an XLSX workbook."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    return sum(ws.max_row - 1 for ws in wb.worksheets if ws.max_row and ws.max_row > 1)


def test_xlsx_backfills_full_year_not_just_visited_months(client):
    """Export must include every month the bill is active in, not only months
    the user has already opened in the UI (bug: past/future months missing)."""
    tok = register_and_login(client, "xlsx_count@test.com")
    cat_id = category_id(client, tok)

    # Active from January — 12 months this year.
    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": cat_id, "due_month": 1},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = date.today().year
    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert _data_rows(r.content) == 12


def test_xlsx_excludes_months_before_bill_start(client):
    """A bill starting in December must not backfill phantom Jan–Nov rows —
    regression check for the _bill_active_in_period monthly-anchor fix."""
    tok = register_and_login(client, "xlsx_start@test.com")
    cat_id = category_id(client, tok)

    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": cat_id, "due_month": 12},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = date.today().year
    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert _data_rows(r.content) == 1


def test_xlsx_excludes_deleted_instances(client):
    """Soft-deleted instances are excluded from the XLSX export (Phase 1 filter check)."""
    tok = register_and_login(client, "xlsx_del@test.com")
    current_year = date.today().year

    r = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 12},
        headers=auth(tok),
    )
    assert r.status_code == 201

    sync_payments(client, tok, month=f"{current_year}-12")
    payments = client.get(
        f"/bills/payments?month={current_year}-12", headers=auth(tok)
    ).json()
    assert len(payments) == 1
    instance_id = payments[0]["id"]

    r = client.delete(f"/bills/payments/{instance_id}", headers=auth(tok))
    assert r.status_code == 204

    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert _data_rows(r.content) == 0


def test_xlsx_partial_deletion(client):
    """Deleting one of two instances leaves exactly one row — proves filter is scoped, not blanket."""
    tok = register_and_login(client, "xlsx_partial@test.com")
    cat_id = category_id(client, tok)
    current_year = date.today().year

    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": cat_id, "due_month": 12},
        headers=auth(tok),
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/bills",
        json={**_BILL_B, "category_id": cat_id, "due_month": 12},
        headers=auth(tok),
    )
    assert r2.status_code == 201

    sync_payments(client, tok, month=f"{current_year}-12")
    payments = client.get(
        f"/bills/payments?month={current_year}-12", headers=auth(tok)
    ).json()
    assert len(payments) == 2

    r = client.delete(f"/bills/payments/{payments[0]['id']}", headers=auth(tok))
    assert r.status_code == 204

    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert _data_rows(r.content) == 1


def test_xlsx_lang_translates_headers_and_sheet_names(client):
    """?lang=pl produces Polish column headers/sheet names and a matching filename."""
    tok = register_and_login(client, "xlsx_lang@test.com")
    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 1},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = date.today().year
    r = client.get(f"/export/xlsx?year={current_year}&lang=pl", headers=auth(tok))
    assert r.status_code == 200
    assert f"pay-tracker-pl-{current_year}.xlsx" in r.headers["content-disposition"]

    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    assert "sty" in wb.sheetnames[0]
    header_row = [cell.value for cell in next(wb.worksheets[0].iter_rows(max_row=1))]
    assert header_row[0] == "Rachunek"


def test_xlsx_defaults_to_english_for_unknown_lang(client):
    tok = register_and_login(client, "xlsx_lang_default@test.com")
    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 1},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = date.today().year
    r = client.get(f"/export/xlsx?year={current_year}&lang=xx", headers=auth(tok))
    assert r.status_code == 200
    assert f"pay-tracker-en-{current_year}.xlsx" in r.headers["content-disposition"]


def test_xlsx_shows_per_payment_amount_for_unpaid(client):
    """An unpaid payment with its own amount appears in the export with that amount."""
    tok = register_and_login(client, "xlsx_ovr@test.com")
    today = date.today()
    r = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": today.month},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok, month=today.strftime("%Y-%m"))
    [inst] = client.get("/bills/payments", headers=auth(tok)).json()
    r = client.patch(
        f"/bills/payments/{inst['id']}", json={"amount": "143.20"}, headers=auth(tok)
    )
    assert r.status_code == 200

    r = client.get(f"/export/xlsx?year={today.year}", headers=auth(tok))
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    period = today.strftime("%Y-%m")
    rows = [
        row
        for ws in wb.worksheets
        for row in ws.iter_rows(min_row=2, values_only=True)
        if row[2] == period
    ]
    assert [row[4] for row in rows] == [143.2]  # columns: Bill, Category, Period, Due Date, Amount
