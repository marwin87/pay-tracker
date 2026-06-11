from datetime import date, datetime
from pydantic import BaseModel
from app.models.bill import BillFrequency, PaymentStatus


class BillTemplateCreate(BaseModel):
    name: str
    frequency: BillFrequency
    amount: float
    due_day: int | None = None
    notes: str | None = None
    auto_generate: bool = True


class BillTemplateUpdate(BaseModel):
    name: str | None = None
    frequency: BillFrequency | None = None
    amount: float | None = None
    due_day: int | None = None
    notes: str | None = None
    auto_generate: bool | None = None


class BillTemplateOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    frequency: BillFrequency
    amount: float
    due_day: int | None
    notes: str | None
    is_archived: bool
    auto_generate: bool
    created_at: datetime


class PaymentInstanceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    bill_id: int
    period: str
    due_date: date
    amount: float
    status: PaymentStatus
    paid_at: datetime | None
    paid_amount: float | None
    notes: str | None


class MarkPaidRequest(BaseModel):
    paid_amount: float | None = None  # defaults to template amount when None
    notes: str | None = None
