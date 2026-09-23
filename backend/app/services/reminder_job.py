import calendar
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.core.config import settings
from app.models.bill import BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.email import (
    send_monthly_summary_email,
    send_reminder_email,
    send_reminder_telegram,
    send_summary_telegram,
)
from app.services.notify import NotificationError, telegram_url

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Channel:
    """Names of the User/PaymentInstance columns that hold one channel's own
    schedule. Email and Telegram are configured and tracked independently."""

    name: str
    enabled: str
    send_minute: str
    windows: tuple[tuple[str, str, str], ...]  # (kind, user flag, instance sent-flag)
    summary_enabled: str
    summary_last_sent: str


EMAIL = Channel(
    "email",
    "email_reminders_enabled",
    "reminder_send_minute",
    (
        ("2_days_before", "notify_2_days_before", "reminder_sent_2_days_before"),
        ("upcoming", "notify_1_day_before", "reminder_sent_upcoming"),
        ("on_day", "notify_on_day", "reminder_sent_on_day"),
        ("1_day_after", "notify_1_day_after", "reminder_sent_overdue"),
    ),
    "monthly_summary_enabled",
    "monthly_summary_last_sent",
)
TELEGRAM = Channel(
    "telegram",
    "telegram_reminders_enabled",
    "telegram_send_minute",
    (
        (
            "2_days_before",
            "telegram_notify_2_days_before",
            "telegram_sent_2_days_before",
        ),
        ("upcoming", "telegram_notify_1_day_before", "telegram_sent_upcoming"),
        ("on_day", "telegram_notify_on_day", "telegram_sent_on_day"),
        ("1_day_after", "telegram_notify_1_day_after", "telegram_sent_overdue"),
    ),
    "telegram_monthly_summary_enabled",
    "telegram_monthly_summary_last_sent",
)
CHANNELS = (EMAIL, TELEGRAM)


def channel_available(user: User, channel: Channel) -> bool:
    """Can this user receive on the channel at all (server + credentials set up)?"""
    if channel is TELEGRAM:
        return telegram_url(user) is not None
    return settings.smtp_host is not None and not _is_blocked_domain(user.email)


def _is_blocked_domain(email: str) -> bool:
    domain = email.split("@")[-1].lower()
    return domain in {d.lower() for d in settings.email_blocked_domains}


_MONTH_NAMES: dict[str, list[str]] = {
    "en": [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
    "pl": [
        "styczeń",
        "luty",
        "marzec",
        "kwiecień",
        "maj",
        "czerwiec",
        "lipiec",
        "sierpień",
        "wrzesień",
        "październik",
        "listopad",
        "grudzień",
    ],
    "de": [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
    ],
}


def _month_label(month: str, lang: str) -> str:
    """Return a human-readable month label, e.g. 'June 2026'."""
    year, m = month.split("-")
    names = _MONTH_NAMES.get(lang, _MONTH_NAMES["en"])
    return f"{names[int(m) - 1]} {year}"


def send_monthly_summary_for_user(
    db: Session, user: User, month: str, channel: Channel = EMAIL
) -> bool:
    """Send the monthly summary on one channel. Returns True on success."""
    if not channel_available(user, channel):
        return False
    lang = user.language_preference or "en"
    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == user.id,
            PaymentInstance.period == month,
            PaymentInstance.is_deleted.is_(False),
        )
        .all()
    )

    paid_rows = []
    unpaid_rows = []
    for inst in instances:
        name = inst.template.name if inst.template else f"bill#{inst.bill_id}"
        currency = inst.template.currency if inst.template else "PLN"
        due_date = inst.due_date.isoformat() if inst.due_date else ""
        if inst.status == PaymentStatus.paid:
            paid_rows.append(
                {
                    "name": name,
                    "due_date": due_date,
                    "amount": inst.amount,
                    "paid_amount": inst.paid_amount,
                    "currency": currency,
                    "paid_at": inst.paid_at,
                }
            )
        else:
            unpaid_rows.append(
                {
                    "name": name,
                    "due_date": due_date,
                    "amount": inst.template.amount if inst.template else inst.amount,
                    "currency": currency,
                }
            )

    month_label = _month_label(month, lang)
    try:
        if channel is TELEGRAM:
            url = telegram_url(user)
            assert url is not None
            send_summary_telegram(
                url=url,
                month_label=month_label,
                paid_rows=paid_rows,
                unpaid_rows=unpaid_rows,
                language=lang,
            )
        else:
            assert settings.smtp_host is not None
            send_monthly_summary_email(
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port,
                smtp_user=settings.smtp_user,
                smtp_password=(
                    settings.smtp_password.get_secret_value()
                    if settings.smtp_password
                    else None
                ),
                smtp_use_tls=settings.smtp_use_tls,
                from_addr=settings.reminder_from or settings.smtp_user or "",
                to_addr=user.email,
                month_label=month_label,
                paid_rows=paid_rows,
                unpaid_rows=unpaid_rows,
                language=lang,
            )
        logger.info(
            "Sent %s monthly summary to user %s for %s", channel.name, user.id, month
        )
        return True
    except NotificationError as exc:
        logger.error(
            "Failed to send %s monthly summary to user %s for %s: %s",
            channel.name,
            user.id,
            month,
            exc,
        )
        return False


def send_reminders_for_user(db: Session, user: User, channel: Channel = EMAIL) -> int:
    """Send due reminders on one channel. Returns count of reminders sent."""
    if not channel_available(user, channel):
        logger.debug("No %s delivery for user %s, skipping", channel.name, user.id)
        return 0
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    due_by_kind = {
        "2_days_before": today + timedelta(days=2),
        "upcoming": today + timedelta(days=1),
        "on_day": today,
        "1_day_after": today - timedelta(days=1),
    }

    template_ids = [
        t.id
        for t in db.query(BillTemplate.id)
        .filter(
            BillTemplate.user_id == user.id,
            BillTemplate.is_archived.is_(False),
            BillTemplate.is_paused.is_(False),
        )
        .all()
    ]
    if not template_ids:
        return 0

    lang = user.language_preference or "en"
    sent = 0
    for kind, user_flag, sent_flag in channel.windows:
        if not getattr(user, user_flag):
            continue
        instances = (
            db.query(PaymentInstance)
            .options(selectinload(PaymentInstance.template))
            .filter(
                PaymentInstance.bill_id.in_(template_ids),
                PaymentInstance.due_date == due_by_kind[kind],
                PaymentInstance.status != PaymentStatus.paid,
                PaymentInstance.is_deleted.is_(False),
                getattr(PaymentInstance, sent_flag).is_(False),
            )
            .all()
        )
        for instance in instances:
            if _send_and_flag(
                db,
                user,
                instance,
                kind=kind,
                flag_attr=sent_flag,
                language=lang,
                channel=channel,
            ):
                sent += 1
    return sent


def _users_due(db: Session, channel: Channel, minute_cond) -> list[User]:
    enabled = getattr(User, channel.enabled)
    any_window = or_(*[getattr(User, uf).is_(True) for _, uf, _ in channel.windows])
    return (
        db.query(User)
        .filter(User.is_active.is_(True), enabled.is_(True), minute_cond, any_window)
        .all()
    )


def _run_jobs(SessionLocal: sessionmaker, current_minute: int, *, exact: bool) -> int:
    """Shared body of the 30-minute job (exact minute match) and the startup
    catch-up (every send time already passed today), run per channel."""
    today = datetime.now(timezone.utc).date()
    is_last_day = today.day == calendar.monthrange(today.year, today.month)[1]
    current_month = today.strftime("%Y-%m")

    db: Session = SessionLocal()
    sent = 0
    try:
        for ch in CHANNELS:
            minute_col = getattr(User, ch.send_minute)
            cond = (
                minute_col == current_minute if exact else minute_col <= current_minute
            )
            for user in _users_due(db, ch, cond):
                sent += send_reminders_for_user(db, user, ch)

            # On the last day of the month, send summaries to all eligible users
            # regardless of send minute — natural retry every 30 min.
            # Note: the query-then-flag pattern is not atomic; two concurrent
            # scheduler runs could both see last_sent=NULL and both send.
            # Acceptable at household scale given the 30-min cadence.
            if not is_last_day:
                continue
            last_sent = getattr(User, ch.summary_last_sent)
            summary_users = (
                db.query(User)
                .filter(
                    User.is_active.is_(True),
                    getattr(User, ch.enabled).is_(True),
                    getattr(User, ch.summary_enabled).is_(True),
                    last_sent.is_(None) | (last_sent != current_month),
                )
                .all()
            )
            for u in summary_users:
                if send_monthly_summary_for_user(db, u, current_month, ch):
                    setattr(u, ch.summary_last_sent, current_month)
                    db.commit()
    finally:
        db.close()
    return sent


def send_daily_reminders(
    SessionLocal: sessionmaker, send_minute: int | None = None
) -> None:
    now_utc = datetime.now(timezone.utc)
    current_minute = (
        send_minute if send_minute is not None else now_utc.hour * 60 + now_utc.minute
    )
    logger.info(
        "Reminder job started (today=%s UTC, minute=%d)", now_utc.date(), current_minute
    )
    sent = _run_jobs(SessionLocal, current_minute, exact=True)
    logger.info("Reminder job finished: %d reminder(s) sent", sent)


def send_catchup_reminders(
    SessionLocal: sessionmaker, send_minute: int | None = None
) -> None:
    """Run on startup: send reminders for all users whose scheduled time has already passed today."""
    now_utc = datetime.now(timezone.utc)
    current_minute = (
        send_minute if send_minute is not None else now_utc.hour * 60 + now_utc.minute
    )
    logger.info(
        "Catch-up reminders started (today=%s UTC, up to minute=%d)",
        now_utc.date(),
        current_minute,
    )
    sent = _run_jobs(SessionLocal, current_minute, exact=False)
    logger.info("Catch-up reminders finished: %d reminder(s) sent", sent)


def _send_and_flag(
    db: Session,
    user: User,
    instance: PaymentInstance,
    *,
    kind: str,
    flag_attr: str,
    language: str,
    channel: Channel = EMAIL,
) -> bool:
    bill_name = (
        instance.template.name if instance.template else f"bill#{instance.bill_id}"
    )
    text: dict[str, Any] = dict(
        bill_name=bill_name,
        due_date=instance.due_date,
        amount=instance.template.amount if instance.template else instance.amount,
        currency=instance.template.currency if instance.template else "PLN",
        kind=kind,
        language=language,
    )

    try:
        if channel is TELEGRAM:
            url = telegram_url(user)
            assert url is not None, "caller must check channel_available"
            send_reminder_telegram(url=url, **text)
        else:
            assert settings.smtp_host is not None, "caller must check channel_available"
            send_reminder_email(
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port,
                smtp_user=settings.smtp_user,
                smtp_password=(
                    settings.smtp_password.get_secret_value()
                    if settings.smtp_password
                    else None
                ),
                smtp_use_tls=settings.smtp_use_tls,
                from_addr=settings.reminder_from or settings.smtp_user or "",
                to_addr=user.email,
                **text,
            )
    except NotificationError as exc:
        logger.error(
            "Failed to send %s %s reminder for user %s, instance %s: %s",
            channel.name,
            kind,
            user.id,
            instance.id,
            exc,
        )
        return False

    setattr(instance, flag_attr, True)
    if channel is EMAIL:
        instance.email_sent_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as commit_exc:
        db.rollback()
        logger.critical(
            "%s reminder sent for user %s, instance %s but flag commit failed — "
            "duplicate send possible on next run: %s",
            channel.name,
            user.id,
            instance.id,
            commit_exc,
        )
        return False
    logger.info(
        "Sent %s %s reminder for '%s' (instance %s, user %s)",
        channel.name,
        kind,
        bill_name,
        instance.id,
        user.id,
    )
    return True
