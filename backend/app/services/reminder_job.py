import logging
import smtplib
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.core.config import settings
from app.models.bill import BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.email import send_reminder_email

logger = logging.getLogger(__name__)


def send_daily_reminders(SessionLocal: sessionmaker) -> None:
    if settings.smtp_host is None:
        logger.warning("Reminder job: SMTP not configured, skipping")
        return

    today = datetime.now(timezone.utc).date()
    tomorrow = today + timedelta(days=1)
    logger.info("Reminder job started (today=%s UTC)", today)

    db: Session = SessionLocal()
    sent = 0
    try:
        users = (
            db.query(User)
            .filter(User.is_active.is_(True), User.email_reminders_enabled.is_(True))
            .all()
        )

        for user in users:
            template_ids = [
                t.id
                for t in db.query(BillTemplate.id)
                .filter(BillTemplate.user_id == user.id)
                .all()
            ]
            if not template_ids:
                continue

            upcoming = (
                db.query(PaymentInstance)
                .options(selectinload(PaymentInstance.template))
                .filter(
                    PaymentInstance.bill_id.in_(template_ids),
                    PaymentInstance.due_date == tomorrow,
                    PaymentInstance.status != PaymentStatus.paid,
                    PaymentInstance.reminder_sent_upcoming.is_(False),
                )
                .all()
            )

            overdue = (
                db.query(PaymentInstance)
                .options(selectinload(PaymentInstance.template))
                .filter(
                    PaymentInstance.bill_id.in_(template_ids),
                    PaymentInstance.due_date < today,
                    PaymentInstance.status != PaymentStatus.paid,
                    PaymentInstance.reminder_sent_overdue.is_(False),
                )
                .all()
            )

            lang = user.language_preference or "en"

            for instance in upcoming:
                if _send_and_flag(db, user, instance, is_overdue=False, language=lang):
                    sent += 1

            for instance in overdue:
                if _send_and_flag(db, user, instance, is_overdue=True, language=lang):
                    sent += 1
    finally:
        db.close()

    logger.info("Reminder job finished: %d email(s) sent", sent)


def _send_and_flag(
    db: Session,
    user: User,
    instance: PaymentInstance,
    *,
    is_overdue: bool,
    language: str,
) -> bool:
    bill_name = (
        instance.template.name if instance.template else f"bill#{instance.bill_id}"
    )
    currency = instance.template.currency if instance.template else "PLN"

    kind = "overdue" if is_overdue else "upcoming"
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
            is_overdue=is_overdue,
            language=language,
        )
        if is_overdue:
            instance.reminder_sent_overdue = True
        else:
            instance.reminder_sent_upcoming = True
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
