# Demo Seed Data

This folder contains a seed script that populates Pay Tracker with realistic demo data — useful for testing, screenshots, or showing the app to someone for the first time.

## What it creates

**User:** `demo@demo.com` / `demo1234`

**11 categories** — the 9 defaults every user gets, plus 2 custom ones used to exercise category-specific edge cases:

| Category | Type | State |
|---|---|---|
| Streaming (Old) | custom | **archived** — still referenced by an active bill |
| Side Hustle | custom | active |

**22 bill templates** covering all frequencies, plus these edge cases:

| Name | Category | Frequency | Amount | Notes |
|---|---|---|---|---|
| Rent | Housing | Monthly | €1,200.00 | |
| Electricity | Utilities | Every 2 months | €95.00 | |
| Internet | Utilities | Monthly | €39.99 | |
| Netflix | Subscriptions | Monthly | €17.99 | |
| Car Insurance | Insurance | Annual | €680.00 | |
| Gym Membership | Healthcare | Monthly | €45.00 | |
| Property Tax | Housing | Quarterly | €210.00 | |
| Spotify *(archived bill)* | Subscriptions | Monthly | €10.99 | |
| Tyre Change | Transport | One-off | €180.00 | |
| Old Music App | **Streaming (Old)** *(archived category)* | Monthly | €4.99 | bill stays active — category is what's archived |
| Coworking Desk | **Side Hustle** *(custom category)* | Monthly | €120.00 | |
| Newspaper Subscription | Subscriptions | Monthly | €12.00 | **paused** |

**55 payment instances** covering all statuses:
- **paid** — historical records with `paid_at` timestamps
- **overdue** — several bills with a missed payment
- **upcoming** — future periods ready to be paid
- Amounts that differ from the template (real-world invoice variance)
- Two instances backdated to today's date so the app always has something due "now"

## Requirements

- Docker containers must be running: `docker compose up`
- Python 3 with the `requests` package

## How to use

**1. Install the dependency (one time):**

```bash
python3 -m pip install requests
```

**2. Start the app:**

```bash
docker compose up
```

**3. Run the seed script from the project root**

```bash
python3 demo/seed.py
```

**4. Open the app:**

Go to [http://localhost:3010](http://localhost:3010) and log in with `demo@demo.com` / `demo1234`.

## Re-running

Running the script again on the same account **wipes and re-seeds** — the restore endpoint replaces all existing data for that user. Safe to run multiple times. If demo data is already present, the script skips the restore; force it with the export/restore API directly if you need to reapply an edited `seed_data.json` to an account that already has data.

## Editing the data

All seed data lives in `demo/seed_data.json`. It follows the same backup format used by the app's export/restore feature (`schema_version: 4`), including an explicit `categories` array — bill templates reference categories by `category_id`. Edit the JSON directly and re-run the script to apply changes.
