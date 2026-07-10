from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, computed_field
from app.models.bill import BillCategory, BillFrequency, PaymentStatus


class BillTemplateCreate(BaseModel):
    name: str
    category: BillCategory
    frequency: BillFrequency
    amount: Decimal = Decimal("0")
    currency: str = "PLN"
    due_day: int | None = Field(None, ge=1, le=31)
    due_month: int | None = Field(None, ge=1, le=12)  # month for annual/one_off
    notes: str | None = None
    is_paused: bool = False


class BillTemplateUpdate(BaseModel):
    name: str | None = None
    category: BillCategory | None = None
    frequency: BillFrequency | None = None
    amount: Decimal | None = None
    currency: str | None = None
    due_day: int | None = Field(None, ge=1, le=31)
    due_month: int | None = Field(None, ge=1, le=12)  # month for annual/one_off
    notes: str | None = None
    is_paused: bool | None = None
    recreate_deleted_future: bool = False  # transient control flag — not persisted


class BillTemplateOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    category: BillCategory
    frequency: BillFrequency
    amount: Decimal
    currency: str
    due_day: int | None
    notes: str | None
    is_archived: bool
    is_paused: bool
    created_at: datetime
    start_period: str | None = None

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
    category: BillCategory
    email_sent_at: datetime | None


class MarkPaidRequest(BaseModel):
    paid_amount: Decimal | None = None  # defaults to template amount when None
    notes: str | None = None


class HasDeletedFutureOut(BaseModel):
    has_deleted_future: bool


class BackupTemplate(BaseModel):
    id: int
    name: str
    category: str | None
    frequency: BillFrequency
    amount: Decimal
    currency: str
    due_day: int | None
    notes: str | None
    is_archived: bool
    is_paused: bool
    start_period: str | None
    created_at: str


class BackupInstance(BaseModel):
    # Intentionally excluded from backup: reminder_sent_2_days_before,
    # reminder_sent_on_day, email_sent_at — transient flags reset to False on restore.
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


class BackupPayload(BaseModel):
    schema_version: int
    bill_templates: list[BackupTemplate]
    payment_instances: list[BackupInstance]


class ExportSummaryOut(BaseModel):
    bill_count: int
    payment_count: int


class RestoreSnapshotOut(BaseModel):
    created_at: datetime
