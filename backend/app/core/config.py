import os
import warnings

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "changeme-use-a-long-random-string"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    database_url: str = "postgresql://paytracker:changeme@localhost:5432/paytracker"

    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # CORS — JSON array in env var, e.g. ALLOWED_ORIGINS=["https://app.example.com"]
    allowed_origins: list[str] = ["http://localhost:3010", "http://localhost:3000"]

    # SMTP (optional)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_use_tls: bool = True
    reminder_from: str | None = None

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_must_not_be_default(cls, v: str) -> str:
        if v == _DEFAULT_JWT_SECRET:
            if os.getenv("ENVIRONMENT", "development") == "production":
                raise ValueError(
                    "JWT_SECRET is set to the default placeholder. "
                    "Set a strong random value via the JWT_SECRET environment variable."
                )
            warnings.warn(
                "JWT_SECRET is set to the default placeholder — insecure for production.",
                stacklevel=2,
            )
        return v


settings = Settings()
