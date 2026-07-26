from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class BillCategory(str, Enum):
    housing = "housing"
    utilities = "utilities"
    insurance = "insurance"
    subscriptions = "subscriptions"
    entertainment = "entertainment"
    transport = "transport"
    healthcare = "healthcare"
    education = "education"
    other = "other"


class BillFrequency(str, Enum):
    monthly = "monthly"
    every_2_months = "every_2_months"
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
    __table_args__ = (
        Index("ix_bill_templates_active", "is_archived", "is_paused"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[BillCategory] = mapped_column(String(50), nullable=False)
    frequency: Mapped[BillFrequency] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="PLN")
    due_day: Mapped[int | None] = mapped_column(
        Integer
    )  # day-of-month for monthly bills
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    # Recurrence anchor: YYYY-MM string set at creation from UTC month.
    # Avoids UTC-vs-local off-by-one when created_at straddles a month boundary.
    # NULL for rows created before this column existed; code falls back to created_at.
    start_period: Mapped[str | None] = mapped_column(String(7))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    instances: Mapped[list["PaymentInstance"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class PaymentInstance(Base):
    """A single payment record for a specific period. Idempotent: (bill_id, period) is unique."""

    __tablename__ = "payment_instances"
    __table_args__ = (
        UniqueConstraint("bill_id", "period", name="uq_payment_instance_bill_period"),
        Index("ix_payment_instance_bill_id", "bill_id"),
        Index("ix_payment_instance_due_date", "due_date"),
        Index("ix_payment_instance_period_active", "period", "is_deleted"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("bill_templates.id"), nullable=False
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        String(10), nullable=False, default=PaymentStatus.upcoming
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_upcoming: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_overdue: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_2_days_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_on_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    template: Mapped["BillTemplate"] = relationship(back_populates="instances")


class Settings(Base):
    """Single-row local settings table — replaces the old per-user User columns."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    language_preference: Mapped[str | None] = mapped_column(
        String(5), nullable=True, default=None
    )
    notifications_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notify_2_days_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    notify_1_day_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notify_on_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    notify_1_day_after: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_time: Mapped[str] = mapped_column(
        String(5), nullable=False, default="08:00", server_default="08:00"
    )  # local "HH:MM"
    monthly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    monthly_summary_last_sent: Mapped[str | None] = mapped_column(
        String(7), nullable=True, default=None
    )
    launch_at_login: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    theme_mode: Mapped[str] = mapped_column(
        String(6), nullable=False, default="system", server_default="system"
    )  # "light" | "dark" | "system"


class RestoreSnapshot(Base):
    """Pre-restore snapshot of the local data, kept for self-serve undo.

    At most one row exists at a time (single local user) — the service layer
    deletes any existing row before inserting a new one, same as the backend's
    delete-then-insert pattern for the per-user unique row.
    """

    __tablename__ = "restore_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
