"""Tests for services.notifications — platform-agnostic due-bill/monthly-summary check.

Ported semantics from backend/app/services/reminder_job.py: 4 timing windows,
each gated by a Settings boolean + a per-instance reminder_sent_* idempotency flag.
"""

from datetime import date, timedelta
from decimal import Decimal

from paytracker.data.models import BillCategory, BillFrequency
from paytracker.services import bills, notifications, settings as settings_service


def _create_bill(db, **overrides):
    base = dict(
        name="Internet",
        category=BillCategory.utilities,
        frequency=BillFrequency.monthly,
        amount=Decimal("50.00"),
        currency="PLN",
        due_day=15,
    )
    base.update(overrides)
    return bills.create_bill(db, **base)


def _instance_due_on(db, bill, due_date: date):
    from paytracker.data.models import PaymentInstance, PaymentStatus

    inst = PaymentInstance(
        bill_id=bill.id,
        period=due_date.strftime("%Y-%m"),
        due_date=due_date,
        amount=bill.amount,
        status=PaymentStatus.upcoming,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


# ── check_due_bills ───────────────────────────────────────────────────────


def test_check_due_bills_respects_disabled_windows(db_session):
    bill = _create_bill(db_session)
    _instance_due_on(db_session, bill, date.today() + timedelta(days=1))
    settings_service.update_settings(
        db_session, notify_1_day_before=False, notify_2_days_before=False,
        notify_on_day=False, notify_1_day_after=False,
    )

    assert notifications.check_due_bills(db_session) == []


def test_check_due_bills_finds_tomorrow_when_enabled(db_session):
    bill = _create_bill(db_session)
    inst = _instance_due_on(db_session, bill, date.today() + timedelta(days=1))
    settings_service.update_settings(db_session, notify_1_day_before=True)

    result = notifications.check_due_bills(db_session)

    assert len(result) == 1
    assert result[0].instance_id == inst.id
    assert result[0].kind == "upcoming"
    assert result[0].flag_attr == "reminder_sent_upcoming"


def test_check_due_bills_skips_already_flagged(db_session):
    bill = _create_bill(db_session)
    inst = _instance_due_on(db_session, bill, date.today() + timedelta(days=1))
    settings_service.update_settings(db_session, notify_1_day_before=True)

    inst.reminder_sent_upcoming = True
    db_session.commit()

    assert notifications.check_due_bills(db_session) == []


def test_check_due_bills_force_ignores_already_flagged(db_session):
    """force=True (manual "Check Now") must re-surface a reminder even if it
    was already flagged sent by a previous automatic check."""
    bill = _create_bill(db_session)
    inst = _instance_due_on(db_session, bill, date.today() + timedelta(days=1))
    settings_service.update_settings(db_session, notify_1_day_before=True)

    inst.reminder_sent_upcoming = True
    db_session.commit()

    result = notifications.check_due_bills(db_session, force=True)

    assert len(result) == 1
    assert result[0].instance_id == inst.id


def test_check_due_bills_skips_paid_instances(db_session):
    from paytracker.data.models import PaymentStatus

    bill = _create_bill(db_session)
    inst = _instance_due_on(db_session, bill, date.today())
    inst.status = PaymentStatus.paid
    db_session.commit()
    settings_service.update_settings(db_session, notify_on_day=True)

    assert notifications.check_due_bills(db_session) == []


def test_check_due_bills_respects_master_toggle(db_session):
    bill = _create_bill(db_session)
    _instance_due_on(db_session, bill, date.today())
    settings_service.update_settings(db_session, notify_on_day=True, notifications_enabled=False)

    assert notifications.check_due_bills(db_session) == []


def test_check_due_bills_covers_all_four_windows(db_session):
    # Separate bills — PaymentInstance is unique on (bill_id, period), and all
    # four due dates fall in the same calendar month, so they'd collide on one bill.
    today = date.today()
    _instance_due_on(db_session, _create_bill(db_session, name="B1"), today + timedelta(days=2))
    _instance_due_on(db_session, _create_bill(db_session, name="B2"), today + timedelta(days=1))
    _instance_due_on(db_session, _create_bill(db_session, name="B3"), today)
    _instance_due_on(db_session, _create_bill(db_session, name="B4"), today - timedelta(days=1))
    settings_service.update_settings(
        db_session,
        notify_2_days_before=True,
        notify_1_day_before=True,
        notify_on_day=True,
        notify_1_day_after=True,
    )

    result = notifications.check_due_bills(db_session)
    kinds = {r.kind for r in result}
    assert kinds == {"2_days_before", "upcoming", "on_day", "overdue"}


def test_mark_reminder_sent_sets_flag(db_session):
    bill = _create_bill(db_session)
    inst = _instance_due_on(db_session, bill, date.today() + timedelta(days=1))

    notifications.mark_reminder_sent(db_session, inst.id, "reminder_sent_upcoming")

    db_session.expire_all()
    from paytracker.data.models import PaymentInstance

    assert db_session.get(PaymentInstance, inst.id).reminder_sent_upcoming is True


# ── check_monthly_summary ────────────────────────────────────────────────


def test_monthly_summary_none_when_not_last_day_of_month(db_session):
    settings_service.update_settings(db_session, monthly_summary_enabled=True)
    not_last_day = date(2026, 6, 15)
    assert notifications.check_monthly_summary(db_session, today=not_last_day) is None


def test_monthly_summary_fires_on_last_day(db_session):
    bill = _create_bill(db_session)
    last_day = date(2026, 6, 30)
    _instance_due_on(db_session, bill, last_day)
    settings_service.update_settings(db_session, monthly_summary_enabled=True)

    summary = notifications.check_monthly_summary(db_session, today=last_day)

    assert summary is not None
    assert summary.month == "2026-06"
    assert len(summary.unpaid) == 1


def test_monthly_summary_idempotent_via_last_sent(db_session):
    settings_service.update_settings(
        db_session, monthly_summary_enabled=True, monthly_summary_last_sent="2026-06"
    )
    last_day = date(2026, 6, 30)

    assert notifications.check_monthly_summary(db_session, today=last_day) is None


def test_monthly_summary_force_ignores_last_sent(db_session):
    settings_service.update_settings(
        db_session, monthly_summary_enabled=True, monthly_summary_last_sent="2026-06"
    )
    last_day = date(2026, 6, 30)

    summary = notifications.check_monthly_summary(db_session, today=last_day, force=True)

    assert summary is not None
    assert summary.month == "2026-06"


def test_monthly_summary_force_ignores_not_last_day(db_session):
    settings_service.update_settings(db_session, monthly_summary_enabled=True)
    not_last_day = date(2026, 6, 15)

    summary = notifications.check_monthly_summary(db_session, today=not_last_day, force=True)

    assert summary is not None
    assert summary.month == "2026-06"


def test_mark_monthly_summary_sent_persists(db_session):
    notifications.mark_monthly_summary_sent(db_session, "2026-06")
    row = settings_service.get_settings(db_session)
    assert row.monthly_summary_last_sent == "2026-06"
