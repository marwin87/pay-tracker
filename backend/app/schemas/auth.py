import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

from app.core.i18n import LOCALES


def _check_language(v: str) -> str:
    if v not in LOCALES:
        raise ValueError(f"Unsupported language: {v}")
    return v


SupportedLanguage = Annotated[str, AfterValidator(_check_language)]

Theme = Literal["light", "dark", "vesperfall"]

EXPORT_FIELD_KEYS: tuple[str, ...] = (
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
MANDATORY_EXPORT_FIELDS: frozenset[str] = frozenset(
    {"bill", "due_date", "amount", "currency"}
)
ExportFieldKey = Literal[
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
]


def validate_export_fields(v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    if not set(v).issubset(EXPORT_FIELD_KEYS):
        raise ValueError("export_fields contains an unknown field key")
    if not MANDATORY_EXPORT_FIELDS.issubset(v):
        raise ValueError(
            f"export_fields must include: {', '.join(sorted(MANDATORY_EXPORT_FIELDS))}"
        )
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=8)]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfileOut(BaseModel):
    model_config = {"from_attributes": True}

    email: EmailStr
    language_preference: str | None
    enabled_languages: list[SupportedLanguage]
    default_currency: str | None
    decimal_separator: Literal[".", ","]
    theme: Theme
    email_reminders_enabled: bool
    notify_2_days_before: bool
    notify_1_day_before: bool
    notify_on_day: bool
    notify_1_day_after: bool
    reminder_send_minute: int
    monthly_summary_enabled: bool
    telegram_chat_id: str | None
    telegram_bot_token_set: bool
    telegram_bot_token_unreadable: bool
    telegram_reminders_enabled: bool
    telegram_notify_2_days_before: bool
    telegram_notify_1_day_before: bool
    telegram_notify_on_day: bool
    telegram_notify_1_day_after: bool
    telegram_send_minute: int
    telegram_monthly_summary_enabled: bool
    browser_notifications_enabled: bool
    export_enabled: bool
    share_enabled: bool
    export_fields: list[ExportFieldKey]


def normalize_chat_id(v: str | None) -> str | None:
    v = (v or "").strip()
    if not v:
        return None  # empty string clears the chat id
    if not re.fullmatch(r"-?\d{1,20}", v):
        raise ValueError("Telegram chat id must be a number (negative for groups)")
    return v


def normalize_bot_token(v: str | None) -> str | None:
    v = (v or "").strip()
    if not v:
        return None
    if not re.fullmatch(r"\d{5,}:[A-Za-z0-9_-]{20,}", v):
        raise ValueError("Invalid Telegram bot token format")
    return v


class UserProfileUpdate(BaseModel):
    language_preference: SupportedLanguage | None = None
    enabled_languages: list[SupportedLanguage] | None = None
    default_currency: str | None = None
    decimal_separator: Literal[".", ","] | None = None
    theme: Theme | None = None
    email_reminders_enabled: bool | None = None
    notify_2_days_before: bool | None = None
    notify_1_day_before: bool | None = None
    notify_on_day: bool | None = None
    notify_1_day_after: bool | None = None
    reminder_send_minute: Annotated[int, Field(ge=0, le=1410)] | None = None
    monthly_summary_enabled: bool | None = None
    telegram_chat_id: str | None = None
    telegram_bot_token: str | None = None  # write-only; "" clears
    telegram_reminders_enabled: bool | None = None
    telegram_notify_2_days_before: bool | None = None
    telegram_notify_1_day_before: bool | None = None
    telegram_notify_on_day: bool | None = None
    telegram_notify_1_day_after: bool | None = None
    telegram_send_minute: Annotated[int, Field(ge=0, le=1410)] | None = None
    telegram_monthly_summary_enabled: bool | None = None
    browser_notifications_enabled: bool | None = None
    export_enabled: bool | None = None
    share_enabled: bool | None = None
    export_fields: list[ExportFieldKey] | None = None

    @field_validator("telegram_chat_id")
    @classmethod
    def _chat_id(cls, v: str | None) -> str | None:
        return normalize_chat_id(v)

    @field_validator("telegram_bot_token")
    @classmethod
    def _bot_token(cls, v: str | None) -> str | None:
        return normalize_bot_token(v)

    @field_validator("export_fields")
    @classmethod
    def _export_fields(cls, v: list[str] | None) -> list[str] | None:
        return validate_export_fields(v)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class SendNotificationNowOut(BaseModel):
    sent: int


class SendMonthlySummaryNowOut(BaseModel):
    sent: bool


class ShareMonthRequest(BaseModel):
    email: EmailStr
    month: Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class ServerTimeOut(BaseModel):
    server_time: datetime


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class SmtpStatusResponse(BaseModel):
    configured: bool


class MessageResponse(BaseModel):
    message: str
