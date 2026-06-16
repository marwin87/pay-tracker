"""Unit tests for app/services/email.py — mocks smtplib.SMTP."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, call, patch

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

    send_reminder_email(**_call(is_overdue=False, language="en"))

    smtp_instance.starttls.assert_called_once()
    smtp_instance.login.assert_called_once_with("user@example.com", "secret")
    smtp_instance.send_message.assert_called_once()


@patch("app.services.email.smtplib.SMTP")
def test_no_login_when_smtp_user_is_none(mock_smtp_cls):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(
        **_call(smtp_user=None, smtp_password=None, is_overdue=False, language="en")
    )

    smtp_instance.starttls.assert_called_once()
    smtp_instance.login.assert_not_called()
    smtp_instance.send_message.assert_called_once()


_SUBJECT_CASES = [
    (False, "en", "Reminder: Internet due tomorrow (99.99 PLN)"),
    (False, "pl", "Przypomnienie: Internet płatne jutro (99.99 PLN)"),
    (False, "de", "Erinnerung: Internet fällig morgen (99.99 PLN)"),
    (True, "en", "Overdue: Internet was due 2026-06-17 (99.99 PLN)"),
    (True, "pl", "Zaległość: Internet było płatne 2026-06-17 (99.99 PLN)"),
    (True, "de", "Überfällig: Internet war fällig 2026-06-17 (99.99 PLN)"),
]


@pytest.mark.parametrize("is_overdue,language,expected_subject", _SUBJECT_CASES)
@patch("app.services.email.smtplib.SMTP")
def test_subject_combinations(mock_smtp_cls, is_overdue, language, expected_subject):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(**_call(is_overdue=is_overdue, language=language))

    sent_msg = smtp_instance.send_message.call_args[0][0]
    assert sent_msg["Subject"] == expected_subject


@patch("app.services.email.smtplib.SMTP")
def test_unknown_language_falls_back_to_english(mock_smtp_cls):
    smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=smtp_instance)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    send_reminder_email(**_call(is_overdue=False, language="xx"))

    sent_msg = smtp_instance.send_message.call_args[0][0]
    assert sent_msg["Subject"] == "Reminder: Internet due tomorrow (99.99 PLN)"
