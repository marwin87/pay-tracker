"""Every locale must carry every backend-used message, with the same {placeholders}
as English — a missing/typo'd one would silently fall back or crash str.format."""

import re
from datetime import date
from decimal import Decimal

import pytest

from app.core.i18n import DEFAULT_LOCALE, LOCALES, _messages, t
from app.services.email import _build_summary_html, reminder_text
from app.services.reminder_job import _month_label

_BACKEND_NAMESPACES = ("Notifications", "ExcelExport")
_BACKEND_KEYS = (
    *(f"PaymentRow.status.{s}" for s in ("upcoming", "overdue", "paid")),
    *(
        f"SettingsPage.excelExport.fields.{k}"
        for k in (
            "bill",
            "category",
            "period",
            "due_date",
            "amount",
            "currency",
            "status",
            "paid_amount",
            "paid_at",
            "notes",
        )
    ),
)


def _flatten(node, prefix=""):
    for k, v in node.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            yield from _flatten(v, key + ".")
        else:
            yield key, v


def _backend_messages(lang):
    flat = dict(_flatten(_messages(lang)))
    return {
        k: v
        for k, v in flat.items()
        if k.startswith(tuple(f"{n}." for n in _BACKEND_NAMESPACES))
        or k in _BACKEND_KEYS
    }


def _placeholders(text):
    return set(re.findall(r"{(\w+)}", text))


@pytest.mark.parametrize("lang", [lang for lang in LOCALES if lang != DEFAULT_LOCALE])
def test_locale_matches_english_keys_and_placeholders(lang):
    en, other = _backend_messages(DEFAULT_LOCALE), _backend_messages(lang)
    assert other.keys() == en.keys()
    for key, text in en.items():
        assert _placeholders(other[key]) == _placeholders(text), f"{lang}: {key}"


@pytest.mark.parametrize("lang", LOCALES)
@pytest.mark.parametrize("kind", ["2_days_before", "upcoming", "on_day", "1_day_after"])
def test_reminder_text_translated_for_every_locale(lang, kind):
    subject, body = reminder_text(
        bill_name="Electric",
        due_date=date(2026, 6, 10),
        amount=Decimal("100.00"),
        currency="PLN",
        kind=kind,
        language=lang,
    )
    assert "Electric" in subject and "100.00 PLN" in subject
    assert "2026-06-10" in body and "100.00 PLN" in body
    if lang != DEFAULT_LOCALE:
        en_subject, _ = reminder_text(
            bill_name="Electric",
            due_date=date(2026, 6, 10),
            amount=Decimal("100.00"),
            currency="PLN",
            kind=kind,
            language=DEFAULT_LOCALE,
        )
        assert subject != en_subject


@pytest.mark.parametrize("lang", LOCALES)
def test_month_label_and_summary_html_for_every_locale(lang):
    label = _month_label("2026-06", lang)
    assert "2026" in label
    html = _build_summary_html(label, [], [], lang)
    assert t(lang, "Notifications.summary.footer") in html
    assert label in html


def test_unknown_language_falls_back_to_english():
    assert t("xx", "Notifications.dueDateLabel") == t(
        DEFAULT_LOCALE, "Notifications.dueDateLabel"
    )
