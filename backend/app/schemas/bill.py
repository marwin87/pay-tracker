from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, computed_field, field_validator, model_validator
from app.models.bill import BillFrequency, PaymentStatus
from app.schemas.auth import normalize_bot_token, normalize_chat_id
from app.schemas.category import CategoryOut

_PERIOD_RE = r"^\d{4}-(0[1-9]|1[0-2])$"


def check_interval(frequency: BillFrequency, interval: int) -> None:
    """monthly: 1-12 months, annual: 1-5 years, one_off: always 1."""
    limit = {BillFrequency.annual: 5, BillFrequency.one_off: 1}.get(frequency, 12)
    if interval > limit:
        raise ValueError(f"interval must be <= {limit} for {frequency.value}")


class BillTemplateCreate(BaseModel):
    name: str
    category_id: int
    frequency: BillFrequency
    interval: int = Field(1, ge=1, le=12)
    amount: Decimal = Decimal("0")
    currency: str = "PLN"
    due_day: int | None = Field(None, ge=1, le=31)
    due_month: int | None = Field(None, ge=1, le=12)  # month for annual/one_off
    end_period: str | None = Field(None, pattern=_PERIOD_RE)  # last recurring month
    notes: str | None = None
    is_paused: bool = False

    @model_validator(mode="after")
    def _interval_fits_frequency(self) -> "BillTemplateCreate":
        check_interval(self.frequency, self.interval)
        return self


class BillTemplateUpdate(BaseModel):
    name: str | None = None
    category_id: int | None = None
    frequency: BillFrequency | None = None
    interval: int | None = Field(None, ge=1, le=12)
    amount: Decimal | None = None
    currency: str | None = None
    due_day: int | None = Field(None, ge=1, le=31)
    due_month: int | None = Field(None, ge=1, le=12)  # month for annual/one_off
    end_period: str | None = Field(None, pattern=_PERIOD_RE)  # null clears the end
    notes: str | None = None
    is_paused: bool | None = None
    recreate_deleted_future: bool = False  # transient control flag — not persisted


class BillTemplateOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    category: CategoryOut
    frequency: BillFrequency
    interval: int
    amount: Decimal
    currency: str
    due_day: int | None
    notes: str | None
    is_archived: bool
    is_paused: bool
    created_at: datetime
    start_period: str | None = None
    end_period: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def due_month(self) -> int | None:
        if self.start_period:
            return int(self.start_period.split("-")[1])
        return None


class PaymentInstanceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    bill_id: int
    period: str
    due_date: date
    amount: Decimal
    status: PaymentStatus
    paid_at: datetime | None
    paid_amount: Decimal | None
    notes: str | None
    bill_name: str
    currency: str
    frequency: BillFrequency
    interval: int = 1
    category: CategoryOut
    email_sent_at: datetime | None
    is_last: bool = False  # final instalment of a fixed-term bill


class MarkPaidRequest(BaseModel):
    paid_amount: Decimal | None = None  # defaults to template amount when None
    notes: str | None = None
    paid_at: date | None = None  # defaults to now() when None; must not be future


class HasDeletedFutureOut(BaseModel):
    has_deleted_future: bool


class BackupCategory(BaseModel):
    id: int
    name: str
    slug: str | None
    color: str
    sort_order: int
    is_default: bool
    is_archived: bool


class BackupTemplate(BaseModel):
    id: int
    name: str
    # v4 backups carry category_id (resolved against this payload's own
    # `categories` array). v2/v3 backups carry the old free-text `category`
    # string instead — kept here so old files still parse; restore falls back
    # to matching it by slug against the user's current categories.
    category_id: int | None = None
    category: str | None = None
    # Lets bills restored without a `categories` section find a category by name.
    category_name: str | None = None
    frequency: BillFrequency
    interval: int = 1
    amount: Decimal
    currency: str
    due_day: int | None
    notes: str | None
    is_archived: bool
    is_paused: bool
    start_period: str | None
    end_period: str | None = None
    created_at: str

    @model_validator(mode="before")
    @classmethod
    def _legacy_frequency(cls, data: object) -> object:
        # Pre-v6 backups: every_2_months / quarterly became monthly + interval.
        if isinstance(data, dict):
            legacy = {"every_2_months": 2, "quarterly": 3}.get(data.get("frequency"))
            if legacy:
                data = {**data, "frequency": "monthly", "interval": legacy}
        return data


class BackupInstance(BaseModel):
    # Intentionally excluded from backup: reminder_sent_2_days_before,
    # reminder_sent_on_day, telegram_sent_*, email_sent_at — transient flags reset
    # to False on restore.
    id: int
    bill_id: int
    period: str
    due_date: str
    amount: Decimal
    status: PaymentStatus
    paid_at: str | None
    paid_amount: Decimal | None
    notes: str | None
    created_at: str
    reminder_sent_upcoming: bool = False
    reminder_sent_overdue: bool = False


class BackupTelegram(BaseModel):
    """Plaintext on purpose: backups must restore on an instance with a different
    JWT_SECRET, so the token cannot travel in its encrypted-at-rest form."""

    bot_token: str
    chat_id: str

    @field_validator("bot_token")
    @classmethod
    def _token(cls, v: str) -> str:
        token = normalize_bot_token(v)
        if token is None:
            raise ValueError("bot_token must not be empty")
        return token

    @field_validator("chat_id")
    @classmethod
    def _chat(cls, v: str) -> str:
        chat_id = normalize_chat_id(v)
        if chat_id is None:
            raise ValueError("chat_id must not be empty")
        return chat_id


class BackupChannelSchedule(BaseModel):
    """One channel's (email or telegram) reminder schedule."""

    enabled: bool
    notify_2_days_before: bool
    notify_1_day_before: bool
    notify_on_day: bool
    notify_1_day_after: bool
    send_minute: int = Field(ge=0, le=1410)
    monthly_summary_enabled: bool


class BackupNotifications(BaseModel):
    email: BackupChannelSchedule | None = None
    telegram: BackupChannelSchedule | None = None
    browser_enabled: bool | None = None


class BackupPreferences(BaseModel):
    language_preference: str | None = Field(default=None, max_length=5)
    enabled_languages: list[str] | None = None
    default_currency: str | None = Field(default=None, max_length=10)

    @field_validator("enabled_languages")
    @classmethod
    def _langs(cls, v: list[str] | None) -> list[str] | None:
        if v is not None and (not v or any(not x or len(x) > 5 for x in v)):
            raise ValueError("enabled_languages must be non-empty language codes")
        return v


class BackupPayload(BaseModel):
    schema_version: int
    # None = section absent from the file; restore leaves that data untouched.
    bill_templates: list[BackupTemplate] | None = None
    payment_instances: list[BackupInstance] | None = None
    preferences: BackupPreferences | None = None
    categories: list[BackupCategory] = []
    telegram: BackupTelegram | None = None
    notifications: BackupNotifications | None = None


class ExportSummaryOut(BaseModel):
    bill_count: int
    payment_count: int


class RestoreSnapshotOut(BaseModel):
    created_at: datetime
