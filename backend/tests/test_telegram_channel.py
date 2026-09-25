"""Telegram is a separate channel from email: own toggle, windows, send time,
summary, and its own per-instance sent-flags."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.schemas.auth import UserProfileUpdate
from app.services import reminder_job as rj
from app.services.notify import NotificationError, encrypt_secret
from tests.test_reminder_job import (
    _make_bill,
    _make_instance,
    _make_user,
    _smtp_settings,
    _today_utc,
)

_TOKEN = "123456789:AAF3kxyz_-abcdefghij"  # pragma: allowlist secret


def _with_telegram(user, *, send_minute=600, **windows):
    user.telegram_bot_token = encrypt_secret(_TOKEN)
    user.telegram_chat_id = "42"
    user.telegram_reminders_enabled = True
    user.telegram_send_minute = send_minute
    # Telegram windows default off/1-day; make each test say what it wants.
    user.telegram_notify_1_day_before = False
    for name, value in windows.items():
        setattr(user, f"telegram_{name}", value)


def _run(db_sessionmaker, minute):
    with patch("app.services.reminder_job.settings") as st:
        _smtp_settings(st)
        rj.send_daily_reminders(db_sessionmaker, send_minute=minute)


@patch("app.services.reminder_job.send_reminder_telegram")
@patch("app.services.reminder_job.send_reminder_email")
def test_channels_follow_their_own_windows_and_send_times(
    mail, tg, db_session, db_sessionmaker
):
    """Email: 1 day before at 08:00. Telegram: on the day at 10:00."""
    user = _make_user(db_session, notify_1_day_before=True, reminder_send_minute=480)
    _with_telegram(user, send_minute=600, notify_on_day=True)
    tomorrow = _make_instance(
        db_session, _make_bill(db_session, user.id).id, _today_utc() + timedelta(days=1)
    )
    today = _make_instance(db_session, _make_bill(db_session, user.id).id, _today_utc())
    tomorrow_id, today_id = tomorrow.id, today.id
    db_session.commit()

    _run(db_sessionmaker, 480)  # only the email schedule is due
    assert mail.call_count == 1 and mail.call_args.kwargs["kind"] == "upcoming"
    tg.assert_not_called()

    _run(db_sessionmaker, 600)  # now only the Telegram schedule is due
    assert mail.call_count == 1
    assert tg.call_count == 1 and tg.call_args.kwargs["kind"] == "on_day"

    db_session.expire_all()
    from app.models.bill import PaymentInstance

    t = db_session.get(PaymentInstance, tomorrow_id)
    d = db_session.get(PaymentInstance, today_id)
    assert t.reminder_sent_upcoming and not t.telegram_sent_upcoming
    assert d.telegram_sent_on_day and not d.reminder_sent_on_day
    assert (
        t.email_sent_at is not None and d.email_sent_at is None
    )  # Telegram never stamps `@`


@patch("app.services.reminder_job.send_reminder_telegram")
@patch("app.services.reminder_job.send_reminder_email")
def test_same_window_sent_once_per_channel(mail, tg, db_session, db_sessionmaker):
    user = _make_user(db_session, notify_1_day_before=True, reminder_send_minute=480)
    _with_telegram(user, send_minute=480, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, _today_utc() + timedelta(days=1))
    db_session.commit()

    _run(db_sessionmaker, 480)
    _run(db_sessionmaker, 480)  # idempotent: flags are per channel
    assert mail.call_count == 1 and tg.call_count == 1


@patch("app.services.reminder_job.send_reminder_telegram")
@patch("app.services.reminder_job.send_reminder_email")
def test_telegram_master_toggle_off_leaves_email_running(
    mail, tg, db_session, db_sessionmaker
):
    user = _make_user(db_session, notify_1_day_before=True, reminder_send_minute=480)
    _with_telegram(user, send_minute=480, notify_1_day_before=True)
    user.telegram_reminders_enabled = False
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, _today_utc() + timedelta(days=1))
    db_session.commit()

    _run(db_sessionmaker, 480)
    assert mail.call_count == 1
    tg.assert_not_called()


@patch("app.services.reminder_job.send_reminder_telegram")
@patch("app.services.reminder_job.send_reminder_email")
def test_failed_telegram_send_leaves_flag_unset_and_email_unaffected(
    mail, tg, db_session, db_sessionmaker
):
    tg.side_effect = NotificationError()
    user = _make_user(db_session, notify_1_day_before=True, reminder_send_minute=480)
    _with_telegram(user, send_minute=480, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(db_session, bill.id, _today_utc() + timedelta(days=1))
    inst_id = inst.id
    db_session.commit()

    _run(db_sessionmaker, 480)
    db_session.expire_all()
    from app.models.bill import PaymentInstance

    inst = db_session.get(PaymentInstance, inst_id)
    assert inst.reminder_sent_upcoming and not inst.telegram_sent_upcoming


@patch("app.services.reminder_job.send_summary_telegram")
@patch("app.services.reminder_job.send_monthly_summary_email")
def test_monthly_summary_toggles_are_per_channel(mail, tg, db_session):
    user = _make_user(db_session)
    _with_telegram(user)
    user.monthly_summary_enabled = False  # email summary off, Telegram summary on
    db_session.commit()

    with patch("app.services.reminder_job.settings") as st:
        _smtp_settings(st)
        assert rj.send_monthly_summary_for_user(
            db_session, user, "2026-06", rj.TELEGRAM
        )
    tg.assert_called_once()
    mail.assert_not_called()


def test_channel_unavailable_without_credentials(db_session):
    user = _make_user(db_session)  # no Telegram token/chat id
    assert not rj.channel_available(user, rj.TELEGRAM)
    assert rj.send_reminders_for_user(db_session, user, rj.TELEGRAM) == 0


@pytest.mark.parametrize(
    "raw,expected", [("  -1001234 ", "-1001234"), ("", None), ("77", "77")]
)
def test_chat_id_normalised(raw, expected):
    assert UserProfileUpdate(telegram_chat_id=raw).telegram_chat_id == expected


@pytest.mark.parametrize("bad", ["@name", "12ab", "1" * 30])
def test_chat_id_rejects_non_numeric(bad):
    with pytest.raises(ValidationError):
        UserProfileUpdate(telegram_chat_id=bad)


@pytest.mark.parametrize("bad", ["123", "abc:def", "12345:short"])
def test_bot_token_rejects_bad_format(bad):
    with pytest.raises(ValidationError):
        UserProfileUpdate(telegram_bot_token=bad)


def test_bot_token_empty_means_clear():
    assert UserProfileUpdate(telegram_bot_token="  ").telegram_bot_token is None


def test_send_minute_bounds():
    with pytest.raises(ValidationError):
        UserProfileUpdate(telegram_send_minute=1440)


@patch("app.services.email.notify.send")
def test_summary_telegram_uses_coloured_icons(send) -> None:
    from decimal import Decimal

    from app.services.email import send_summary_telegram

    send_summary_telegram(
        url="tgram://x/y",
        month_label="2026-09",
        paid_rows=[{"name": "Rent"}],
        unpaid_rows=[
            {"name": "Gas", "amount": Decimal("45.00"), "currency": "EUR", "due_date": "2026-09-20"},
            {"name": "Aviva", "amount": Decimal("0.00"), "currency": "PLN", "due_date": "2026-09-25"},
        ],
        language="en",
    )
    body = send.call_args.args[2]
    assert body.startswith("\u200b\n✅ Rent")  # blank line under the title
    assert "❌ Gas — 45.00 EUR (2026-09-20)" in body
    assert "❌ Aviva (2026-09-25)" in body  # zero amount hidden


@patch("app.services.email.notify.send")
def test_reminder_telegram_does_not_repeat_subject_in_body(send) -> None:
    from datetime import date
    from decimal import Decimal

    from app.services.email import send_reminder_telegram

    send_reminder_telegram(
        url="tgram://x/y",
        bill_name="Aviva",
        due_date=date(2026, 9, 25),
        amount=Decimal("12.50"),
        currency="PLN",
        kind="upcoming",
        language="pl",
    )
    _, subject, body = send.call_args.args
    assert subject == "Przypomnienie: Aviva płatne jutro (12.50 PLN)"
    assert body == "Termin: 2026-09-25"


@patch("app.services.email.notify.send")
def test_reminder_telegram_hides_zero_amount(send) -> None:
    from datetime import date
    from decimal import Decimal

    from app.services.email import send_reminder_telegram

    send_reminder_telegram(
        url="tgram://x/y",
        bill_name="Aviva",
        due_date=date(2026, 9, 25),
        amount=Decimal("0.00"),
        currency="PLN",
        kind="upcoming",
        language="pl",
    )
    _, subject, body = send.call_args.args
    assert subject == "Przypomnienie: Aviva płatne jutro"
    assert body == "Termin: 2026-09-25"


def test_email_texts_hide_zero_amount() -> None:
    from datetime import date
    from decimal import Decimal

    from app.services.email import _build_summary_html, reminder_text

    kw = dict(
        bill_name="Aviva", due_date=date(2026, 9, 25), currency="PLN",
        kind="upcoming", language="en",
    )
    subject, body = reminder_text(amount=Decimal("0.00"), **kw)
    assert subject == "Reminder: Aviva due tomorrow"
    assert "0.00" not in body and "Amount" not in body
    assert "2026-09-25" in body

    subject, body = reminder_text(amount=Decimal("12.50"), **kw)
    assert subject.endswith("(12.50 PLN)") and "Amount: 12.50 PLN" in body

    out = _build_summary_html(
        "Sept 2026",
        [],
        [
            {"name": "Aviva", "amount": Decimal("0.00"), "currency": "PLN", "due_date": "2026-09-25"},
            {"name": "Gas", "amount": Decimal("45.00"), "currency": "PLN", "due_date": "2026-09-20"},
        ],
        "en",
    )
    aviva_row = out.split("Aviva</td>")[1].split("</tr>")[0]
    assert "—" in aviva_row and "0.00" not in aviva_row
    assert "45.00 PLN</td>" in out
