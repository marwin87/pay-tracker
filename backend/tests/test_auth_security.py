"""Tests for logout token revocation and CSRF double-submit protection."""

from tests.conftest import auth, register_and_login

_PASSWORD = "pw123456"  # pragma: allowlist secret


# ---------------------------------------------------------------------------
# Logout — requires auth, revokes every token issued for the user
# ---------------------------------------------------------------------------


def test_logout_requires_auth(client):
    r = client.post("/auth/logout")
    assert r.status_code == 401


def test_logout_revokes_old_token(client):
    token = register_and_login(client, "revoke@test.com", _PASSWORD)

    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 200

    r = client.post("/auth/logout", headers=auth(token))
    assert r.status_code == 204

    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 401


def test_login_after_logout_issues_a_valid_new_token(client):
    token = register_and_login(client, "relogin@test.com", _PASSWORD)
    client.post("/auth/logout", headers=auth(token))

    login_r = client.post(
        "/auth/login", json={"email": "relogin@test.com", "password": _PASSWORD}
    )
    assert login_r.status_code == 200
    new_token = login_r.json()["access_token"]

    r = client.get("/auth/me", headers=auth(new_token))
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# CSRF — double-submit cookie check on cookie-authenticated mutations
# ---------------------------------------------------------------------------


def test_cookie_session_without_csrf_header_returns_403(client):
    register_and_login(client, "csrf_missing@test.com", _PASSWORD)
    # No Authorization header: relies on the session cookies the register
    # response just set on this TestClient, same as a real browser tab.
    r = client.patch("/auth/me", json={"language_preference": "pl"})
    assert r.status_code == 403


def test_cookie_session_with_valid_csrf_header_succeeds(client):
    register_and_login(client, "csrf_ok@test.com", _PASSWORD)
    csrf_token = client.cookies.get("csrf_token")
    assert csrf_token

    r = client.patch(
        "/auth/me",
        json={"language_preference": "pl"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert r.status_code == 200


def test_bearer_token_request_bypasses_csrf_check(client):
    token = register_and_login(client, "csrf_bearer@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me", json={"language_preference": "pl"}, headers=auth(token)
    )
    assert r.status_code == 200
