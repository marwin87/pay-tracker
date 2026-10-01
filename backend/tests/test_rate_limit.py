"""Rate limiting on the unauthenticated auth endpoints."""

from unittest.mock import patch

from app.core import rate_limit
from app.core.config import settings
from tests.conftest import register_and_login

_PASSWORD = "pw123456"  # pragma: allowlist secret
_NEW_PASSWORD = "newpass123"  # pragma: allowlist secret


def _login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_blocks_after_repeated_failures_for_one_email(client):
    register_and_login(client, "rl@test.com", _PASSWORD)
    for _ in range(10):
        assert _login(client, "rl@test.com", "wrong-pass").status_code == 401
    r = _login(client, "rl@test.com", _PASSWORD)  # even the right password is held
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_login_failures_for_unknown_email_are_limited_too(client):
    for _ in range(10):
        assert _login(client, "ghost@test.com", "wrong-pass").status_code == 401
    assert _login(client, "ghost@test.com", "wrong-pass").status_code == 429


def test_successful_logins_do_not_count(client):
    register_and_login(client, "ok@test.com", _PASSWORD)
    for _ in range(15):
        assert _login(client, "ok@test.com", _PASSWORD).status_code == 200


def test_one_email_being_blocked_does_not_block_others(client):
    register_and_login(client, "a@test.com", _PASSWORD)
    register_and_login(client, "b@test.com", _PASSWORD)
    for _ in range(10):
        _login(client, "a@test.com", "wrong-pass")
    assert _login(client, "a@test.com", _PASSWORD).status_code == 429
    assert _login(client, "b@test.com", _PASSWORD).status_code == 200


def test_register_limited_per_ip(client):
    for i in range(10):
        r = client.post(
            "/auth/register", json={"email": f"u{i}@test.com", "password": _PASSWORD}
        )
        assert r.status_code == 201
    r = client.post(
        "/auth/register", json={"email": "u11@test.com", "password": _PASSWORD}
    )
    assert r.status_code == 429


def test_forgot_password_limited_per_email(client):
    with patch("app.routers.auth.send_password_reset_email"):
        for _ in range(3):
            r = client.post("/auth/forgot-password", json={"email": "v@test.com"})
            assert r.status_code == 200
        r = client.post("/auth/forgot-password", json={"email": "v@test.com"})
        assert r.status_code == 429
        # another address from the same IP is still fine
        r = client.post("/auth/forgot-password", json={"email": "w@test.com"})
        assert r.status_code == 200


def test_reset_password_limited_per_ip(client):
    for _ in range(20):
        r = client.post(
            "/auth/reset-password",
            json={"token": "nope", "new_password": _NEW_PASSWORD},
        )
        assert r.status_code == 400
    r = client.post(
        "/auth/reset-password", json={"token": "nope", "new_password": _NEW_PASSWORD}
    )
    assert r.status_code == 429


def test_limit_expires_after_the_window(client):
    clock = [1000.0]
    with patch("app.core.rate_limit.time.monotonic", lambda: clock[0]):
        for _ in range(10):
            _login(client, "late@test.com", "wrong-pass")
        assert _login(client, "late@test.com", "wrong-pass").status_code == 429
        clock[0] += 901
        assert _login(client, "late@test.com", "wrong-pass").status_code == 401


def test_can_be_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    for _ in range(12):
        assert _login(client, "off@test.com", "wrong-pass").status_code == 401


def test_memory_is_pruned_when_many_distinct_keys(monkeypatch):
    monkeypatch.setattr(rate_limit, "_PRUNE_ABOVE", 5)
    clock = [0.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: clock[0])
    for i in range(6):
        rate_limit.record(f"k{i}", 10)
    clock[0] = 100.0
    rate_limit.record("fresh", 10)
    assert list(rate_limit._hits) == ["fresh"]
