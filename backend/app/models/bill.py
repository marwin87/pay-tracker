from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BillFrequency(str, Enum):
    monthly = "monthly"
    quarterly = "quarterly"
    annual = "annual"
    one_off = "one_off"


class PaymentStatus(str, Enum):
    upcoming = "upcoming"
    overdue = "overdue"
    paid = "paid"


class BillTemplate(Base):
    """Recurring bill definition. Instances are generated from this."""

    __tablename__ = "bill_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    frequency: Mapped[BillFrequency] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    due_day: Mapped[int | None] = mapped_column(Integer)  # day-of-month for monthly bills
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_generate: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    instances: Mapped[list["PaymentInstance"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class PaymentInstance(Base):
    """A single payment record for a specific period. Idempotent: (bill_id, period) is unique."""

    __tablename__ = "payment_instances"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bill_templates.id"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        String(10), nullable=False, default=PaymentStatus.upcoming
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    template: Mapped["BillTemplate"] = relationship(back_populates="instances")
