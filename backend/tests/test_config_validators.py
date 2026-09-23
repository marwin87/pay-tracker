"""Tests for Settings validators that harden JWT secret strength and
password-reset token expiry outside ENVIRONMENT=development."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_default_jwt_secret_rejected_in_production():
    with pytest.raises(ValidationError):
        # _env_file=None: a developer .env with a real JWT_SECRET must not mask the default
        Settings(environment="production", _env_file=None)


def test_short_jwt_secret_rejected_in_production():
    weak_secret = "too-short"  # pragma: allowlist secret
    with pytest.raises(ValidationError):
        Settings(environment="production", jwt_secret=weak_secret)


def test_strong_jwt_secret_accepted_in_production():
    settings = Settings(environment="production", jwt_secret="x" * 32)
    assert settings.jwt_secret == "x" * 32


def test_weak_jwt_secret_allowed_in_development():
    settings = Settings(environment="development")
    assert settings.jwt_secret


def test_never_expiring_reset_token_rejected_in_production():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            jwt_secret="x" * 32,
            password_reset_token_expire_minutes=0,
        )


def test_never_expiring_reset_token_allowed_in_development():
    settings = Settings(
        environment="development", password_reset_token_expire_minutes=0
    )
    assert settings.password_reset_token_expire_minutes == 0


def test_docs_enabled_in_development():
    settings = Settings(environment="development")
    assert settings.docs_enabled is True


def test_docs_disabled_in_production():
    settings = Settings(environment="production", jwt_secret="x" * 32)
    assert settings.docs_enabled is False
