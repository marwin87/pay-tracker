from __future__ import annotations

import calendar
import io
from datetime import date

import pandas as pd
from sqlalchemy.orm import Session, selectinload

from paytracker.data.models import BillTemplate, PaymentInstance

_COLUMNS = [
    "Bill",
    "Category",
    "Period",
    "Due Date",
    "Amount",
    "Currency",
    "Status",
    "Paid Amount",
    "Paid At",
    "Notes",
]


def export_xlsx_bytes(db: Session, year: int | None = None) -> bytes:
    year = year or date.today().year

    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            PaymentInstance.period.startswith(f"{year}-"),
            PaymentInstance.is_deleted.is_(False),
        )
        .order_by(PaymentInstance.due_date)
        .all()
    )

    by_month: dict[int, list[dict]] = {m: [] for m in range(1, 13)}
    for i in instances:
        month = int(i.period[5:7])
        by_month[month].append(
            {
                "Bill": i.template.name,
                "Category": i.template.category,
                "Period": i.period,
                "Due Date": i.due_date.isoformat(),
                "Amount": float(i.amount),
                "Currency": i.template.currency,
                "Status": i.status,
                "Paid Amount": float(i.paid_amount) if i.paid_amount else None,
                "Paid At": i.paid_at.isoformat() if i.paid_at else None,
                "Notes": i.notes,
            }
        )

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for month in range(1, 13):
            sheet_name = f"{calendar.month_abbr[month]} {year}"
            rows = by_month[month]
            df = (
                pd.DataFrame(rows, columns=_COLUMNS)
                if rows
                else pd.DataFrame(columns=_COLUMNS)
            )
            df.to_excel(writer, index=False, sheet_name=sheet_name)
    buf.seek(0)
    return buf.read()
