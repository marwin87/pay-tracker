# Pay Tracker

A self-hosted household bill tracking web app. Each month's payment instances are generated automatically from bill templates, the dashboard shows what is upcoming and overdue at a glance, and any family member can mark bills paid from any device.

No third-party data sharing. No ongoing subscription cost. Runs locally with Docker Compose or in the cloud by switching an environment variable.


## What it does

You define a bill template once: name, amount, currency, recurrence frequency, and the day of month it is due. Pay Tracker then generates a payment instance for each applicable period automatically. When you open the payments page for a month, any missing instances are seeded on the spot — no background job needed.

Each instance carries a live status:

- Upcoming — due date is in the future
- Overdue — due date has passed and the bill is unpaid (computed at response time, not stored)
- Paid — marked paid by the user, with the actual amount paid and the date recorded

Marking a bill paid triggers generation of the next period's instance. Recurring bills continue indefinitely until you archive the template. One-off bills produce no follow-on instance.


## Stack

- Frontend: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, next-intl
- Backend: FastAPI, Python 3.13, SQLAlchemy 2.0, Alembic, Pydantic v2
- Database: PostgreSQL 17 (co-located in the backend container)
- Runtime: Docker Compose (backend on port 8010, frontend on port 3010)


## Project structure

```
frontend/
  src/
    app/
      dashboard/
        page.tsx              Landing page after login
        layout.tsx            Nav bar shared across dashboard pages
        bills/
          page.tsx            Active bill templates list
          archived/page.tsx   Archived templates with payment history
        payments/
          page.tsx            Payment list with month selector
    components/
      bills/
        BillTemplateForm.tsx  Create / edit form for a bill template
        BillTemplateRow.tsx   Single row in the templates list
        DayPicker.tsx         Calendar-style day-of-month selector (1-31)
        CategoryCombobox.tsx  Free-text category input with suggestions
        ArchiveConfirmDialog.tsx
      payments/
        PaymentRow.tsx        Single payment instance row with status badge
        MarkPaidDialog.tsx    Amount-override dialog for marking a bill paid
        DeletePaymentDialog.tsx Confirmation dialog for deleting a payment
      LanguageToggle.tsx      EN / PL / DE switcher saved per user account
      ThemeToggle.tsx         Light / dark mode toggle
    lib/
      api.ts                  Base fetch wrapper (attaches JWT, handles errors)
      auth.ts                 Login and register calls
      bills-api.ts            Bill template CRUD
      payments-api.ts         Payment instance fetch, mark-paid, revert, delete
      export-api.ts           Blob download utility for .xlsx export
      user-api.ts             User preferences (locale)
    context/
      auth-context.tsx        JWT storage and current-user state
      locale-context.tsx      Active locale for next-intl

backend/
  app/
    main.py                   FastAPI app, router registration, CORS
    models/
      user.py                 User (id, email, hashed_password)
      bill.py                 BillTemplate, PaymentInstance, enums
    schemas/
      auth.py                 Register / login request and token response
      bill.py                 All bill and payment Pydantic schemas
    routers/
      auth.py                 POST /auth/register, POST /auth/login
      bills.py                Bill template CRUD + payment endpoints
      export.py               GET /export/xlsx, GET /export/json
    services/
      recurrence.py           Instance generation and frequency scheduling
    core/
      database.py             SQLAlchemy engine and session
      deps.py                 current_user dependency (JWT decode)
      security.py             Password hashing, JWT creation
      config.py               Environment variable loading

alembic/                      Database migration revisions
```


## How it works

### Bill templates and recurrence

A BillTemplate is the source of truth for a recurring bill. It stores the recurrence frequency (monthly, every 2 months, quarterly, annual, one-off) and a start_period anchor (YYYY-MM, set at creation time) which the scheduler uses to determine whether the template falls on a given month.

When a user opens the payments page for the current month, the backend calls ensure_current_period_instances. For each active, non-paused, non-one-off template it checks whether the month is on-schedule using the anchor and frequency, then inserts a PaymentInstance if one does not already exist. The (bill_id, period) unique constraint makes this idempotent — the call can fire on every page load without creating duplicates.

Due dates are clamped to the last day of shorter months. A template with due_day 31 lands on 28, 29, or 30 depending on the month.

### Marking a bill paid

The user opens the mark-paid dialog, optionally overrides the amount, adds a note, and confirms. The backend records paid_at, paid_amount, and status = paid, then calls generate_next_instance which inserts the following period's instance (again idempotent). The frontend replaces the updated row in local state without a full re-fetch.

### Reverting a payment

An icon button (↺) appears on any paid instance. Clicking it calls POST /bills/payments/{id}/unpay, which clears paid_at and paid_amount and resets status to upcoming or overdue based on whether the due date has passed. The auto-generated next-period instance created by the original mark-paid is kept intact to avoid cascading data loss. No confirmation dialog — the action is trivially reversible by marking paid again.

### Deleting a payment

For one-off bills: the single instance is deleted. For recurring bills: the current and all future instances for that template are deleted, and the template is archived so no new instances are generated.

### Status classification

Overdue status is computed at response time. After fetching instances from the database, any instance with due_date before today and status = upcoming is returned as overdue in the API response. The database value is not changed — this avoids scheduled jobs and keeps the logic simple.

### Authentication

JWT-based. The frontend stores the token in memory via AuthContext and attaches it to every API call. Token expiry causes a redirect to login. The DEPLOY_MODE environment variable switches between local JWT auth (FastAPI handles everything) and cloud auth (Supabase, deferred to a future slice).

### Internationalisation

next-intl with three locales: English (en), Polish (pl), German (de). The active locale is saved to the user's account and restored on login. Currency defaults are locale-aware: pl defaults to PLN, de to EUR, en to USD.


## Running the app

Copy the environment file and start everything with Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

The frontend is at http://localhost:3010 and the API docs are at http://localhost:8010/docs.

To wipe the database and start clean:

```bash
docker compose down -v && docker compose up --build
```

To run only the frontend (against a running backend):

```bash
cd frontend && npm run dev
```

To run only the backend:

```bash
cd backend && uv run uvicorn app.main:app --reload
```


## Database migrations

Migrations run automatically on container start via Alembic. To generate a new revision after changing a model:

```bash
docker compose exec backend uv run alembic revision --autogenerate -m "describe the change"
```

The new file appears in backend/alembic/versions/ and is applied on the next container start.


## Environment variables

| Variable | Description |
| --- | --- |
| DEPLOY_MODE | LOCAL or CLOUD — controls auth mode |
| SECRET_KEY | JWT signing secret |
| DATABASE_URL | PostgreSQL connection string |
| NEXT_PUBLIC_API_URL | Backend URL seen by the browser |

Copy .env.example to .env and fill in the values. Never commit .env.


## Export

Two export endpoints are available at /export/xlsx and /export/json (authentication required).

The .xlsx export (GET /export/xlsx?year=YYYY) produces a 12-sheet workbook — one sheet per calendar month — with columns: Bill, Category, Period, Due Date, Amount, Currency, Status, Paid Amount, Paid At, Notes. Defaults to the current year; empty months produce a sheet with headers only. An Export button on the Payments page triggers the download directly from the UI.

The JSON export contains all bill templates and payment instances in a structured format suitable for backup and restore.

Both are accessible from the API docs at http://localhost:8010/docs.
