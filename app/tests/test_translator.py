from paytracker.ui.i18n import get_language, set_language, t


def test_default_language_is_english():
    set_language(None)
    assert get_language() == "en"


def test_set_language_switches_translations():
    set_language("pl")
    assert t("Nav.payments") == "Płatności"
    set_language("en")
    assert t("Nav.payments") == "Payments"


def test_set_language_falls_back_to_english_for_unsupported_code():
    set_language("fr")
    assert get_language() == "en"


def test_interpolation():
    set_language("en")
    assert t("PaymentsPage.due", date="2026-07-24") == "Due 2026-07-24"


def test_missing_key_returns_key_itself():
    set_language("en")
    assert t("Nonexistent.key") == "Nonexistent.key"


def test_all_three_languages_have_matching_key_sets():
    import json
    from pathlib import Path

    catalog_dir = Path(__file__).parent.parent / "paytracker" / "ui" / "i18n"
    en_keys = set(json.loads((catalog_dir / "en.json").read_text()).keys())
    for lang in ("pl", "de"):
        lang_keys = set(json.loads((catalog_dir / f"{lang}.json").read_text()).keys())
        assert lang_keys == en_keys, f"{lang}.json key mismatch: {en_keys ^ lang_keys}"
