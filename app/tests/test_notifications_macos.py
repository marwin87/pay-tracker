"""Tests for services.notifications.macos — osascript firing and run_check
orchestration. subprocess.run is mocked throughout: tests must never pop a
real macOS notification or depend on running on macOS."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from paytracker.data.models import Base, BillCategory, BillFrequency, PaymentInstance, PaymentStatus
from paytracker.services import bills, settings as settings_service
from paytracker.services.notifications import macos


def _session_factory():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def test_escape_applescript_string_handles_quotes_and_backslashes():
    assert macos._escape_applescript_string('say "hi"') == 'say \\"hi\\"'
    assert macos._escape_applescript_string("C:\\path") == "C:\\\\path"


@patch("paytracker.services.notifications.macos.subprocess.run")
def test_fire_notification_calls_osascript(mock_run):
    mock_run.return_value = MagicMock(returncode=0)
    result = macos.fire_notification("Title", "Message")

    assert result is True
    args = mock_run.call_args[0][0]
    assert args[0] == "osascript"
    assert "display notification" in args[2]


@patch("paytracker.services.notifications.macos.subprocess.run")
def test_fire_notification_returns_false_on_failure(mock_run):
    import subprocess

    mock_run.side_effect = subprocess.CalledProcessError(1, "osascript")
    assert macos.fire_notification("Title", "Message") is False


@patch("paytracker.services.notifications.macos.fire_notification")
def test_run_check_fires_and_flags_due_reminder(mock_fire):
    mock_fire.return_value = True
    sf = _session_factory()

    with sf() as db:
        bill = bills.create_bill(
            db, name="Rent", category=BillCategory.housing,
            frequency=BillFrequency.monthly, amount=Decimal("500.00"),
            currency="EUR", due_day=1,
        )
        inst = PaymentInstance(
            bill_id=bill.id,
            period=(date.today() + timedelta(days=1)).strftime("%Y-%m"),
            due_date=date.today() + timedelta(days=1),
            amount=bill.amount,
            status=PaymentStatus.upcoming,
        )
        db.add(inst)
        db.commit()
        inst_id = inst.id
        settings_service.update_settings(db, notify_1_day_before=True)

    fired = macos.run_check(sf)

    assert fired == 1
    mock_fire.assert_called_once()
    with sf() as db:
        assert db.get(PaymentInstance, inst_id).reminder_sent_upcoming is True


@patch("paytracker.services.notifications.macos.fire_notification")
def test_run_check_does_not_flag_when_notification_fails(mock_fire):
    mock_fire.return_value = False
    sf = _session_factory()

    with sf() as db:
        bill = bills.create_bill(
            db, name="Rent", category=BillCategory.housing,
            frequency=BillFrequency.monthly, amount=Decimal("500.00"),
            currency="EUR", due_day=1,
        )
        inst = PaymentInstance(
            bill_id=bill.id,
            period=(date.today() + timedelta(days=1)).strftime("%Y-%m"),
            due_date=date.today() + timedelta(days=1),
            amount=bill.amount,
            status=PaymentStatus.upcoming,
        )
        db.add(inst)
        db.commit()
        inst_id = inst.id
        settings_service.update_settings(db, notify_1_day_before=True)

    fired = macos.run_check(sf)

    assert fired == 0
    with sf() as db:
        # Not flagged — a failed notification must be retried on the next check.
        assert db.get(PaymentInstance, inst_id).reminder_sent_upcoming is False


@patch("paytracker.services.notifications.macos.fire_notification")
def test_run_check_is_idempotent_across_calls(mock_fire):
    mock_fire.return_value = True
    sf = _session_factory()

    with sf() as db:
        bill = bills.create_bill(
            db, name="Rent", category=BillCategory.housing,
            frequency=BillFrequency.monthly, amount=Decimal("500.00"),
            currency="EUR", due_day=1,
        )
        inst = PaymentInstance(
            bill_id=bill.id,
            period=(date.today() + timedelta(days=1)).strftime("%Y-%m"),
            due_date=date.today() + timedelta(days=1),
            amount=bill.amount,
            status=PaymentStatus.upcoming,
        )
        db.add(inst)
        db.commit()
        settings_service.update_settings(db, notify_1_day_before=True)

    first = macos.run_check(sf)
    second = macos.run_check(sf)

    assert first == 1
    assert second == 0  # already flagged, no duplicate


@patch("paytracker.services.notifications.macos.fire_notification")
def test_run_check_force_refires_every_call(mock_fire):
    """The "Check Now" button (force=True) must re-fire every time it's
    clicked, unlike the automatic 15-minute background check."""
    mock_fire.return_value = True
    sf = _session_factory()

    with sf() as db:
        bill = bills.create_bill(
            db, name="Rent", category=BillCategory.housing,
            frequency=BillFrequency.monthly, amount=Decimal("500.00"),
            currency="EUR", due_day=1,
        )
        inst = PaymentInstance(
            bill_id=bill.id,
            period=(date.today() + timedelta(days=1)).strftime("%Y-%m"),
            due_date=date.today() + timedelta(days=1),
            amount=bill.amount,
            status=PaymentStatus.upcoming,
        )
        db.add(inst)
        db.commit()
        # monthly_summary_enabled=False isolates this test to the due-bill
        # reminder path — force=True also bypasses the monthly summary's
        # last-day-of-month gate (intentional, see check_monthly_summary),
        # which would otherwise add a second notification unrelated to what
        # this test is checking.
        settings_service.update_settings(
            db, notify_1_day_before=True, monthly_summary_enabled=False
        )

    first = macos.run_check(sf, force=True)
    second = macos.run_check(sf, force=True)
    third = macos.run_check(sf, force=True)

    assert first == 1
    assert second == 1  # force bypasses the "already sent" flag every time
    assert third == 1
