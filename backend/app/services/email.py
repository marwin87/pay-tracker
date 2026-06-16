import smtplib
from datetime import date
from decimal import Decimal
from email.message import EmailMessage

_SUBJECTS: dict[tuple[str, str], str] = {
    (
        "2_days_before",
        "en",
    ): "Reminder: {bill_name} due in 2 days ({amount} {currency})",
    (
        "2_days_before",
        "pl",
    ): "Przypomnienie: {bill_name} płatne za 2 dni ({amount} {currency})",
    (
        "2_days_before",
        "de",
    ): "Erinnerung: {bill_name} fällig in 2 Tagen ({amount} {currency})",
    ("upcoming", "en"): "Reminder: {bill_name} due tomorrow ({amount} {currency})",
    ("upcoming", "pl"): "Przypomnienie: {bill_name} płatne jutro ({amount} {currency})",
    ("upcoming", "de"): "Erinnerung: {bill_name} fällig morgen ({amount} {currency})",
    ("on_day", "en"): "Due today: {bill_name} ({amount} {currency})",
    ("on_day", "pl"): "Płatne dziś: {bill_name} ({amount} {currency})",
    ("on_day", "de"): "Heute fällig: {bill_name} ({amount} {currency})",
    (
        "1_day_after",
        "en",
    ): "Overdue: {bill_name} was due yesterday ({amount} {currency})",
    (
        "1_day_after",
        "pl",
    ): "Zaległość: {bill_name} było płatne wczoraj ({amount} {currency})",
    (
        "1_day_after",
        "de",
    ): "Überfällig: {bill_name} war gestern fällig ({amount} {currency})",
}

_BODIES: dict[tuple[str, str], str] = {
    ("2_days_before", "en"): (
        "This is a reminder that {bill_name} is due in 2 days ({due_date}).\n"
        "Amount: {amount} {currency}\n\n"
        "Manage your reminders in the Pay Tracker app."
    ),
    ("2_days_before", "pl"): (
        "Przypominamy, że {bill_name} jest płatne za 2 dni ({due_date}).\n"
        "Kwota: {amount} {currency}\n\n"
        "Zarządzaj przypomnieniami w aplikacji Pay Tracker."
    ),
    ("2_days_before", "de"): (
        "Erinnerung: {bill_name} ist in 2 Tagen fällig ({due_date}).\n"
        "Betrag: {amount} {currency}\n\n"
        "Verwalten Sie Ihre Erinnerungen in der Pay Tracker App."
    ),
    ("upcoming", "en"): (
        "This is a reminder that {bill_name} is due tomorrow ({due_date}).\n"
        "Amount: {amount} {currency}\n\n"
        "Manage your reminders in the Pay Tracker app."
    ),
    ("upcoming", "pl"): (
        "Przypominamy, że {bill_name} jest płatne jutro ({due_date}).\n"
        "Kwota: {amount} {currency}\n\n"
        "Zarządzaj przypomnieniami w aplikacji Pay Tracker."
    ),
    ("upcoming", "de"): (
        "Erinnerung: {bill_name} ist morgen fällig ({due_date}).\n"
        "Betrag: {amount} {currency}\n\n"
        "Verwalten Sie Ihre Erinnerungen in der Pay Tracker App."
    ),
    ("on_day", "en"): (
        "{bill_name} is due today ({due_date}).\n"
        "Amount: {amount} {currency}\n\n"
        "Manage your reminders in the Pay Tracker app."
    ),
    ("on_day", "pl"): (
        "{bill_name} jest płatne dzisiaj ({due_date}).\n"
        "Kwota: {amount} {currency}\n\n"
        "Zarządzaj przypomnieniami w aplikacji Pay Tracker."
    ),
    ("on_day", "de"): (
        "{bill_name} ist heute fällig ({due_date}).\n"
        "Betrag: {amount} {currency}\n\n"
        "Verwalten Sie Ihre Erinnerungen in der Pay Tracker App."
    ),
    ("1_day_after", "en"): (
        "{bill_name} was due yesterday ({due_date}) and remains unpaid.\n"
        "Amount: {amount} {currency}\n\n"
        "Manage your reminders in the Pay Tracker app."
    ),
    ("1_day_after", "pl"): (
        "{bill_name} było płatne wczoraj ({due_date}) i nadal nie zostało opłacone.\n"
        "Kwota: {amount} {currency}\n\n"
        "Zarządzaj przypomnieniami w aplikacji Pay Tracker."
    ),
    ("1_day_after", "de"): (
        "{bill_name} war gestern fällig ({due_date}) und ist noch unbezahlt.\n"
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
    smtp_use_tls: bool = True,
    from_addr: str = "",
    to_addr: str,
    bill_name: str,
    due_date: date,
    amount: Decimal,
    currency: str,
    kind: str,
    language: str,
) -> None:
    lang = language if (kind, language) in _SUBJECTS else "en"
    ctx = {
        "bill_name": bill_name,
        "due_date": due_date.isoformat(),
        "amount": amount,
        "currency": currency,
    }

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = _SUBJECTS[(kind, lang)].format(**ctx)
    msg.set_content(_BODIES[(kind, lang)].format(**ctx))

    with smtplib.SMTP(smtp_host, smtp_port) as smtp:
        if smtp_use_tls:
            smtp.starttls()
        if smtp_user:
            smtp.login(smtp_user, smtp_password or "")
        smtp.send_message(msg)
