import calendar
import io
import json
from datetime import date, datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import current_user
from app.models.bill import BillTemplate, PaymentInstance
from app.models.user import User

router = APIRouter(prefix="/export", tags=["export"])

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


@router.get("/xlsx")
def export_xlsx(
    year: int = Query(default_factory=lambda: date.today().year),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == me.id,
            PaymentInstance.period.startswith(f"{year}-"),
        )
        .order_by(PaymentInstance.due_date)
        .all()
    )

    # Index instances by month number (1–12)
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

    filename = f"pay-tracker-{year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/json")
def export_json(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    templates = db.query(BillTemplate).filter(BillTemplate.user_id == me.id).all()
    template_ids = [t.id for t in templates]
    instances = (
        db.query(PaymentInstance)
        .filter(PaymentInstance.bill_id.in_(template_ids))
        .all()
        if template_ids
        else []
    )
    payload = {
        "schema_version": 2,
        "exported_by": me.email,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "bill_templates": [
            {
                "id": t.id,
                "name": t.name,
                "category": t.category,
                "frequency": t.frequency,
                "amount": float(t.amount),
                "currency": t.currency,
                "due_day": t.due_day,
                "notes": t.notes,
                "is_archived": t.is_archived,
                "is_paused": t.is_paused,
                "start_period": t.start_period,
                "created_at": t.created_at.isoformat(),
            }
            for t in templates
        ],
        "payment_instances": [
            {
                "id": i.id,
                "bill_id": i.bill_id,
                "period": i.period,
                "due_date": i.due_date.isoformat(),
                "amount": float(i.amount),
                "status": i.status,
                "paid_at": i.paid_at.isoformat() if i.paid_at else None,
                "paid_amount": float(i.paid_amount) if i.paid_amount else None,
                "notes": i.notes,
                "created_at": i.created_at.isoformat(),
            }
            for i in instances
        ],
    }
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="pay-tracker-backup-{datetime.now(timezone.utc).date()}.json"'
        },
    )
