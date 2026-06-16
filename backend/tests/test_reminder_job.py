"""Unit tests for app/services/reminder_job.py."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.bill  # noqa: F401 — register models
import app.models.user  # noqa: F401
from app.core.database import Base
from app.models.bill import BillFrequency, BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.reminder_job import send_daily_reminders

_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_SessionLocal = sessionmaker(bind=_ENGINE, autocommit=False, autoflush=False)


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.create_all(bind=_ENGINE)
    yield
    Base.metadata.drop_all(bind=_ENGINE)


def _make_user(db, email="u@test.com", reminders=True) -> User:
    user = User(
        email=email,
        password_hash="x",
        is_active=True,
        email_reminders_enabled=reminders,
    )
    db.add(user)
    db.flush()
    return user


def _make_bill(db, user_id: int) -> BillTemplate:
    bill = BillTemplate(
        name="Internet",
        frequency=BillFrequency.monthly,
        amount=Decimal("99.99"),
        currency="PLN",
        user_id=user_id,
    )
    db.add(bill)
    db.flush()
    return bill


def _make_instance(db, bill_id: int, due_date: date, **kwargs) -> PaymentInstance:
    inst = PaymentInstance(
        bill_id=bill_id,
        period=due_date.strftime("%Y-%m"),
        due_date=due_date,
        amount=Decimal("99.99"),
        status=PaymentStatus.upcoming,
        **kwargs,
    )
    db.add(inst)
    db.flush()
    return inst


# ---------------------------------------------------------------------------


@patch("app.services.reminder_job.settings")
@patch("app.services.reminder_job.send_reminder_email")
def test_no_smtp_skips_all(mock_send, mock_settings):
    mock_settings.smtp_host = None

    send_daily_reminders(_SessionLocal)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_reminder_email")
def test_upcoming_instance_sends_and_flips_flag(mock_send):
    today = date.today()
    db = _SessionLocal()
    user = _make_user(db)
    bill = _make_bill(db, user.id)
    inst = _make_instance(db, bill.id, due_date=today + timedelta(days=1))
    inst_id = inst.id
    db.commit()
    db.close()

    with patch("app.services.reminder_job.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = None
        mock_settings.smtp_password = None
        mock_settings.reminder_from = "r@test.com"

        send_daily_reminders(_SessionLocal)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["is_overdue"] is False

    db = _SessionLocal()
    refreshed = db.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_upcoming is True
    assert refreshed.reminder_sent_overdue is False
    db.close()


@patch("app.services.reminder_job.send_reminder_email")
def test_overdue_instance_sends_and_flips_flag(mock_send):
    today = date.today()
    db = _SessionLocal()
    user = _make_user(db)
    bill = _make_bill(db, user.id)
    inst = _make_instance(db, bill.id, due_date=today - timedelta(days=1))
    inst_id = inst.id
    db.commit()
    db.close()

    with patch("app.services.reminder_job.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = None
        mock_settings.smtp_password = None
        mock_settings.reminder_from = "r@test.com"

        send_daily_reminders(_SessionLocal)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["is_overdue"] is True

    db = _SessionLocal()
    refreshed = db.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_overdue is True
    assert refreshed.reminder_sent_upcoming is False
    db.close()


@patch("app.services.reminder_job.send_reminder_email")
def test_already_sent_flag_skips_email(mock_send):
    today = date.today()
    db = _SessionLocal()
    user = _make_user(db)
    bill = _make_bill(db, user.id)
    _make_instance(
        db,
        bill.id,
        due_date=today + timedelta(days=1),
        reminder_sent_upcoming=True,
    )
    db.commit()
    db.close()

    with patch("app.services.reminder_job.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = None
        mock_settings.smtp_password = None
        mock_settings.reminder_from = "r@test.com"

        send_daily_reminders(_SessionLocal)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_reminder_email")
def test_opt_out_user_skips_email(mock_send):
    today = date.today()
    db = _SessionLocal()
    user = _make_user(db, reminders=False)
    bill = _make_bill(db, user.id)
    _make_instance(db, bill.id, due_date=today + timedelta(days=1))
    db.commit()
    db.close()

    with patch("app.services.reminder_job.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = None
        mock_settings.smtp_password = None
        mock_settings.reminder_from = "r@test.com"

        send_daily_reminders(_SessionLocal)

    mock_send.assert_not_called()
