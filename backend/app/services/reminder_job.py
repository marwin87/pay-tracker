import logging
import smtplib
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.core.config import settings
from app.models.bill import BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.email import send_reminder_email

logger = logging.getLogger(__name__)


def send_reminders_for_user(db: Session, user: User) -> int:
    """Send due reminders for a single user. Returns count of emails sent."""
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    tomorrow = today + timedelta(days=1)
    two_days_out = today + timedelta(days=2)
    yesterday = today - timedelta(days=1)

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

    windows: list[tuple[str, date, str]] = []
    if user.notify_2_days_before:
        windows.append(("2_days_before", two_days_out, "reminder_sent_2_days_before"))
    if user.notify_1_day_before:
        windows.append(("upcoming", tomorrow, "reminder_sent_upcoming"))
    if user.notify_on_day:
        windows.append(("on_day", today, "reminder_sent_on_day"))
    if user.notify_1_day_after:
        windows.append(("1_day_after", yesterday, "reminder_sent_overdue"))

    for kind, due, flag_attr in windows:
        instances = (
            db.query(PaymentInstance)
            .options(selectinload(PaymentInstance.template))
            .filter(
                PaymentInstance.bill_id.in_(template_ids),
                PaymentInstance.due_date == due,
                PaymentInstance.status != PaymentStatus.paid,
                PaymentInstance.is_deleted.is_(False),
                getattr(PaymentInstance, flag_attr).is_(False),
            )
            .all()
        )
        for instance in instances:
            if _send_and_flag(
                db, user, instance, kind=kind, flag_attr=flag_attr, language=lang
            ):
                sent += 1

    return sent


def send_daily_reminders(
    SessionLocal: sessionmaker, send_minute: int | None = None
) -> None:
    if settings.smtp_host is None:
        logger.warning("Reminder job: SMTP not configured, skipping")
        return

    now_utc = datetime.now(timezone.utc)
    current_minute = (
        send_minute if send_minute is not None else now_utc.hour * 60 + now_utc.minute
    )
    today = now_utc.date()
    logger.info("Reminder job started (today=%s UTC, minute=%d)", today, current_minute)

    db: Session = SessionLocal()
    sent = 0
    try:
        users = (
            db.query(User)
            .filter(
                User.is_active.is_(True),
                User.email_reminders_enabled.is_(True),
                User.reminder_send_minute == current_minute,
                (
                    User.notify_1_day_before.is_(True)
                    | User.notify_2_days_before.is_(True)
                    | User.notify_on_day.is_(True)
                    | User.notify_1_day_after.is_(True)
                ),
            )
            .all()
        )

        for user in users:
            sent += send_reminders_for_user(db, user)
    finally:
        db.close()

    logger.info("Reminder job finished: %d email(s) sent", sent)


def _send_and_flag(
    db: Session,
    user: User,
    instance: PaymentInstance,
    *,
    kind: str,
    flag_attr: str,
    language: str,
) -> bool:
    bill_name = (
        instance.template.name if instance.template else f"bill#{instance.bill_id}"
    )
    currency = instance.template.currency if instance.template else "PLN"

    try:
        send_reminder_email(
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            smtp_user=settings.smtp_user,
            smtp_password=settings.smtp_password,
            smtp_use_tls=settings.smtp_use_tls,
            from_addr=settings.reminder_from or settings.smtp_user or "",
            to_addr=user.email,
            bill_name=bill_name,
            due_date=instance.due_date,
            amount=instance.amount,
            currency=currency,
            kind=kind,
            language=language,
        )
        setattr(instance, flag_attr, True)
        instance.email_sent_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except Exception as commit_exc:
            db.rollback()
            logger.critical(
                "Email sent to %s for instance %s but flag commit failed — "
                "duplicate send possible on next run: %s",
                user.email,
                instance.id,
                commit_exc,
            )
            return False
        logger.info(
            "Sent %s reminder to %s for '%s' (instance %s)",
            kind,
            user.email,
            bill_name,
            instance.id,
        )
        return True
    except smtplib.SMTPException as exc:
        logger.error(
            "Failed to send %s reminder to %s for instance %s: %s",
            kind,
            user.email,
            instance.id,
            exc,
        )
        return False
