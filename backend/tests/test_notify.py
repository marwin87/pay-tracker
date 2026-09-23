from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services.notify import (
    NotificationError,
    encrypt_secret,
    send,
    smtp_url,
    telegram_url,
)

_KW = dict(
    host="smtp.example.com",
    port=587,
    user="user@example.com",
    password="p@ss/word",  # pragma: allowlist secret
    use_tls=True,
    from_addr="rem@example.com",
    to_addr="to@example.com",
)


def test_smtp_url_escapes_credentials_and_sets_mode():
    url = smtp_url(**_KW)
    assert url.startswith(
        "mailto://user%40example.com:p%40ss%2Fword@smtp.example.com:587"  # pragma: allowlist secret
    )
    assert "mode=starttls" in url and "to=to%40example.com" in url


def test_smtp_url_without_auth_or_tls():
    url = smtp_url(**{**_KW, "user": None, "use_tls": False})
    assert url.startswith("mailto://smtp.example.com:587?") and "mode=insecure" in url


@pytest.mark.parametrize("added,notified", [(False, True), (True, False)])
def test_send_raises_when_apprise_fails(added, notified):
    with patch("app.services.notify.apprise.Apprise") as ap:
        ap.return_value.add.return_value = added
        ap.return_value.notify.return_value = notified
        with pytest.raises(NotificationError):
            send("mailto://x", "t", "b")


def _user(chat_id="42", token="123456789:AAF3kxyz_-abcdefghij"):
    return SimpleNamespace(
        id=1,
        telegram_chat_id=chat_id,
        telegram_bot_token=encrypt_secret(token) if token else None,
    )


def test_telegram_url_decrypts_stored_token():
    assert telegram_url(_user()) == "tgram://123456789:AAF3kxyz_-abcdefghij/42"


def test_telegram_url_needs_token_and_chat_id():
    assert telegram_url(_user(chat_id=None)) is None
    assert telegram_url(_user(token=None)) is None


def test_stored_token_is_not_plaintext_and_undecryptable_key_is_handled():
    user = _user()
    assert "AAF3k" not in user.telegram_bot_token
    with patch("app.services.notify.settings") as st:
        st.jwt_secret = (
            "a-different-secret-of-sufficient-length"  # pragma: allowlist secret
        )
        assert telegram_url(user) is None


def test_telegram_url_is_accepted_by_apprise():
    import apprise

    assert apprise.Apprise().add("tgram://123456789:AAF3kxyz_-abc/-1001234567890")
