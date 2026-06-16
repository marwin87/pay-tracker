"""Unit tests for app/services/email.py — mocks smtplib.SMTP."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.services.email import send_reminder_email

_BASE = dict(
    smtp_host="smtp.example.com",
    smtp_port=587,
    smtp_user="user@example.com",
    smtp_password="secret",
    from_addr="reminders@example.com",
    to_addr="user@example.com",
    bill_name="Internet",
    due_date=date(2026, 6, 17),
    amount=Decimal("99.99"),
    currency="PLN",
)


def _call(**overrides):
    return {**_BASE, **overrides}


@patch("app.services.email.smtplib.SMTP")
def test_starttls_login_send_quit_sequence(mock_smtp_cls):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(**_call(kind="upcoming", language="en"))

    smtp_instance.starttls.assert_called_once()
    smtp_instance.login.assert_called_once_with("user@example.com", "secret")
    smtp_instance.send_message.assert_called_once()


@patch("app.services.email.smtplib.SMTP")
def test_no_login_when_smtp_user_is_none(mock_smtp_cls):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(
        **_call(smtp_user=None, smtp_password=None, kind="upcoming", language="en")
    )

    smtp_instance.starttls.assert_called_once()
    smtp_instance.login.assert_not_called()
    smtp_instance.send_message.assert_called_once()


_SUBJECT_CASES = [
    ("2_days_before", "en", "Reminder: Internet due in 2 days (99.99 PLN)"),
    ("2_days_before", "pl", "Przypomnienie: Internet płatne za 2 dni (99.99 PLN)"),
    ("2_days_before", "de", "Erinnerung: Internet fällig in 2 Tagen (99.99 PLN)"),
    ("upcoming", "en", "Reminder: Internet due tomorrow (99.99 PLN)"),
    ("upcoming", "pl", "Przypomnienie: Internet płatne jutro (99.99 PLN)"),
    ("upcoming", "de", "Erinnerung: Internet fällig morgen (99.99 PLN)"),
    ("on_day", "en", "Due today: Internet (99.99 PLN)"),
    ("on_day", "pl", "Płatne dziś: Internet (99.99 PLN)"),
    ("on_day", "de", "Heute fällig: Internet (99.99 PLN)"),
    ("1_day_after", "en", "Overdue: Internet was due yesterday (99.99 PLN)"),
    ("1_day_after", "pl", "Zaległość: Internet było płatne wczoraj (99.99 PLN)"),
    ("1_day_after", "de", "Überfällig: Internet war gestern fällig (99.99 PLN)"),
]


@pytest.mark.parametrize("kind,language,expected_subject", _SUBJECT_CASES)
@patch("app.services.email.smtplib.SMTP")
def test_subject_combinations(mock_smtp_cls, kind, language, expected_subject):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(**_call(kind=kind, language=language))

    sent_msg = smtp_instance.send_message.call_args[0][0]
    assert sent_msg["Subject"] == expected_subject


@patch("app.services.email.smtplib.SMTP")
def test_unknown_language_falls_back_to_english(mock_smtp_cls):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(**_call(kind="upcoming", language="xx"))

    sent_msg = smtp_instance.send_message.call_args[0][0]
    assert sent_msg["Subject"] == "Reminder: Internet due tomorrow (99.99 PLN)"
