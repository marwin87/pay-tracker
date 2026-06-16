import smtplib
from datetime import date
from decimal import Decimal
from email.message import EmailMessage

_SUBJECTS: dict[tuple[bool, str], str] = {
    (False, "en"): "Reminder: {bill_name} due tomorrow ({amount} {currency})",
    (False, "pl"): "Przypomnienie: {bill_name} płatne jutro ({amount} {currency})",
    (False, "de"): "Erinnerung: {bill_name} fällig morgen ({amount} {currency})",
    (True, "en"): "Overdue: {bill_name} was due {due_date} ({amount} {currency})",
    (True, "pl"): "Zaległość: {bill_name} było płatne {due_date} ({amount} {currency})",
    (True, "de"): "Überfällig: {bill_name} war fällig {due_date} ({amount} {currency})",
}

_BODIES: dict[tuple[bool, str], str] = {
    (False, "en"): (
        "This is a reminder that {bill_name} is due tomorrow ({due_date}).\n"
        "Amount: {amount} {currency}\n\n"
        "Manage your reminders in the Pay Tracker app."
    ),
    (False, "pl"): (
        "Przypominamy, że {bill_name} jest płatne jutro ({due_date}).\n"
        "Kwota: {amount} {currency}\n\n"
        "Zarządzaj przypomnieniami w aplikacji Pay Tracker."
    ),
    (False, "de"): (
        "Erinnerung: {bill_name} ist morgen fällig ({due_date}).\n"
        "Betrag: {amount} {currency}\n\n"
        "Verwalten Sie Ihre Erinnerungen in der Pay Tracker App."
    ),
    (True, "en"): (
        "{bill_name} was due on {due_date} and remains unpaid.\n"
        "Amount: {amount} {currency}\n\n"
        "Manage your reminders in the Pay Tracker app."
    ),
    (True, "pl"): (
        "{bill_name} było płatne {due_date} i nadal nie zostało opłacone.\n"
        "Kwota: {amount} {currency}\n\n"
        "Zarządzaj przypomnieniami w aplikacji Pay Tracker."
    ),
    (True, "de"): (
        "{bill_name} war am {due_date} fällig und ist noch unbezahlt.\n"
        "Betrag: {amount} {currency}\n\n"
        "Verwalten Sie Ihre Erinnerungen in der Pay Tracker App."
    ),
}


def send_reminder_email(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    from_addr: str,
    to_addr: str,
    bill_name: str,
    due_date: date,
    amount: Decimal,
    currency: str,
    is_overdue: bool,
    language: str,
) -> None:
    lang = language if (is_overdue, language) in _SUBJECTS else "en"
    ctx = {
        "bill_name": bill_name,
        "due_date": due_date.isoformat(),
        "amount": amount,
        "currency": currency,
    }

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = _SUBJECTS[(is_overdue, lang)].format(**ctx)
    msg.set_content(_BODIES[(is_overdue, lang)].format(**ctx))

    with smtplib.SMTP(smtp_host, smtp_port) as smtp:
        smtp.starttls()
        if smtp_user:
            smtp.login(smtp_user, smtp_password or "")
        smtp.send_message(msg)
