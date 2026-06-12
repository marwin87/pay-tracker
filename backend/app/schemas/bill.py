from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from app.models.bill import BillFrequency, PaymentStatus


class BillTemplateCreate(BaseModel):
    name: str
    category: str | None = None
    frequency: BillFrequency
    amount: Decimal = Decimal("0")
    currency: str = "PLN"
    due_day: int | None = Field(None, ge=1, le=31)
    notes: str | None = None
    is_paused: bool = False


class BillTemplateUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    frequency: BillFrequency | None = None
    amount: Decimal | None = None
    currency: str | None = None
    due_day: int | None = Field(None, ge=1, le=31)
    notes: str | None = None
    is_paused: bool | None = None


class BillTemplateOut(BaseModel):
    model_config = {"from_attributes": True}

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
    created_at: datetime


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


class MarkPaidRequest(BaseModel):
    paid_amount: Decimal | None = None  # defaults to template amount when None
    notes: str | None = None
