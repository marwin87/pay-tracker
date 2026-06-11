from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    deploy_mode: str = "LOCAL"
    database_url: str = "postgresql://paytracker:changeme@localhost:5432/paytracker"

    jwt_secret: str = "changeme-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # SMTP (optional)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    reminder_from: str | None = None


settings = Settings()
