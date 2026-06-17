#!/usr/bin/env python3
"""Seed the database with demo data via the restore API endpoint."""

import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Missing dependency. Run: pip install requests")
    sys.exit(1)

BASE_URL = "http://localhost:8010"
EMAIL = "demo@demo.com"
PASSWORD = "demo1234"
DATA_FILE = Path(__file__).parent / "seed_data.json"


def register(session: requests.Session) -> None:
    r = session.post(f"{BASE_URL}/auth/register", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code == 201:
        print(f"  User created: {EMAIL}")
    elif r.status_code == 400 and "already" in r.text.lower():
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


def restore(session: requests.Session, token: str) -> None:
    payload = DATA_FILE.read_text()
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

    print()
    print("Done. Log in at http://localhost:3010")
    print(f"  Email:    {EMAIL}")
    print(f"  Password: {PASSWORD}")


if __name__ == "__main__":
    main()
