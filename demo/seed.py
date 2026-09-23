#!/usr/bin/env python3
"""Seed the database with demo data via the restore API endpoint."""

import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

try:
    import requests
except ImportError:
    print("Missing dependency. Run: pip install requests")
    sys.exit(1)

BASE_URL = os.environ.get("SEED_BASE_URL", "http://localhost:8010")
EMAIL = "demo@demo.com"
PASSWORD = "demo1234"
DATA_FILE = Path(__file__).parent / "seed_data.json"


def register(session: requests.Session) -> None:
    r = session.post(f"{BASE_URL}/auth/register", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code == 201:
        print(f"  User created: {EMAIL}")
    elif r.status_code in (400, 409) and "already" in r.text.lower():
        print(f"  User already exists: {EMAIL}")
    else:
        print(f"  Register failed ({r.status_code}): {r.text}")
        sys.exit(1)


def login(session: requests.Session) -> str:
    r = session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        print(f"  Login failed ({r.status_code}): {r.text}")
        sys.exit(1)
    token = r.json()["access_token"]
    print("  Logged in, token received")
    return token


def inject_current_month_cases(data: dict) -> dict:
    """Replace whichever bills the current month lands on with instances covering
    every status/amount/note combination, so the Payments page shows the full
    variety immediately on the month it opens to by default — regardless of
    which real-world date the script is run on. Static seed_data.json rows are
    dated in fixed 2026 months and won't generally line up with "today"."""
    today = date.today()
    period = today.strftime("%Y-%m")
    today_iso = today.isoformat()
    created_at = f"{today_iso}T09:00:00+00:00"

    def day(n: int) -> str:
        # Earlier day in the current month, clamped to the 1st if that would
        # spill into the previous month (e.g. script run on the 1st/2nd).
        d = today - timedelta(days=n)
        if d.month != today.month or d.year != today.year:
            d = today.replace(day=1)
        return d.isoformat()

    current_month_cases = [
        # Rent — upcoming, due today
        {
            "id": 9001, "bill_id": 1, "period": period, "due_date": today_iso,
            "amount": 1200.0, "status": "upcoming", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Internet — overdue
        {
            "id": 9002, "bill_id": 4, "period": period, "due_date": day(6),
            "amount": 39.99, "status": "overdue", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": True,
        },
        # Gym Membership — paid, full amount, no note
        {
            "id": 9003, "bill_id": 14, "period": period, "due_date": day(5),
            "amount": 45.0, "status": "paid", "paid_at": f"{day(5)}T07:00:00+00:00",
            "paid_amount": 45.0, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Netflix — paid, full amount, with note
        {
            "id": 9004, "bill_id": 8, "period": period, "due_date": day(4),
            "amount": 17.99, "status": "paid", "paid_at": f"{day(4)}T08:00:00+00:00",
            "paid_amount": 17.99, "notes": "Paid via gift card", "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Language School — paid, partial amount, no note
        {
            "id": 9005, "bill_id": 17, "period": period, "due_date": day(3),
            "amount": 89.0, "status": "paid", "paid_at": f"{day(3)}T09:00:00+00:00",
            "paid_amount": 80.0, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Cinema Club — paid, partial amount, with note
        {
            "id": 9006, "bill_id": 11, "period": period, "due_date": day(2),
            "amount": 24.99, "status": "paid", "paid_at": f"{day(2)}T09:00:00+00:00",
            "paid_amount": 19.99, "notes": "Group discount applied", "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
    ]

    # Remove any static instance that would collide on (bill_id, period)
    current_month_keys = {(inst["bill_id"], period) for inst in current_month_cases}
    data["payment_instances"] = [
        inst for inst in data["payment_instances"]
        if (inst["bill_id"], inst["period"]) not in current_month_keys
    ]
    data["payment_instances"].extend(current_month_cases)
    return data


def has_data(session: requests.Session, token: str) -> bool:
    r = session.get(
        f"{BASE_URL}/bills",
        headers={"Authorization": f"Bearer {token}"},
    )
    return r.status_code == 200 and len(r.json()) > 0


def configure_profile(session: requests.Session, token: str) -> None:
    r = session.patch(
        f"{BASE_URL}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            # Every notification channel off: the demo account must never send anything.
            "email_reminders_enabled": False,
            "monthly_summary_enabled": False,
            "telegram_reminders_enabled": False,
            "telegram_monthly_summary_enabled": False,
            "browser_notifications_enabled": False,
            "enabled_languages": ["en", "pl", "es"],
        },
    )
    if r.status_code != 200:
        print(f"  Profile configuration failed ({r.status_code}): {r.text}")
        sys.exit(1)
    print("  All notifications (email, Telegram, browser) disabled, languages set to en/pl/es")


def restore(session: requests.Session, token: str) -> None:
    if has_data(session, token):
        print("  Demo data already present, skipping restore.")
        return
    data = json.loads(DATA_FILE.read_text())
    data = inject_current_month_cases(data)
    payload = json.dumps(data)
    r = session.post(
        f"{BASE_URL}/export/restore",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("seed_data.json", payload, "application/json")},
    )
    if r.status_code != 200:
        print(f"  Restore failed ({r.status_code}): {r.text}")
        sys.exit(1)
    result = r.json()
    print(f"  Restored {result['restored_templates']} bill templates")
    print(f"  Restored {result['restored_instances']} payment instances")


def main() -> None:
    if not DATA_FILE.exists():
        print(f"Seed data file not found: {DATA_FILE}")
        sys.exit(1)

    print("Pay Tracker — demo seed")
    print(f"Target: {BASE_URL}")
    print()

    with requests.Session() as session:
        print("1. Registering user...")
        register(session)

        print("2. Logging in...")
        token = login(session)

        print("3. Restoring seed data...")
        restore(session, token)

        print("4. Configuring profile...")
        configure_profile(session, token)

    print()
    print("Done. Log in at http://localhost:3010")
    print(f"  Email:    {EMAIL}")
    print(f"  Password: {PASSWORD}")


if __name__ == "__main__":
    main()
