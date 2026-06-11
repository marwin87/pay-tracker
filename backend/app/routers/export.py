import io
import json
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import current_user
from app.models.bill import BillTemplate, PaymentInstance
from app.models.user import User

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/xlsx")
def export_xlsx(
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    instances = db.query(PaymentInstance).options(selectinload(PaymentInstance.template)).order_by(PaymentInstance.due_date).all()
    rows = [
        {
            "Bill": i.template.name,
            "Period": i.period,
            "Due Date": i.due_date.isoformat(),
            "Amount": float(i.amount),
            "Status": i.status,
            "Paid Amount": float(i.paid_amount) if i.paid_amount else None,
            "Paid At": i.paid_at.isoformat() if i.paid_at else None,
            "Notes": i.notes,
        }
        for i in instances
    ]
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Payments")
    buf.seek(0)
    filename = f"pay-tracker-{datetime.now(timezone.utc).date()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/json")
def export_json(
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    templates = db.query(BillTemplate).all()
    instances = db.query(PaymentInstance).all()
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "bill_templates": [
            {
                "id": t.id,
                "name": t.name,
                "frequency": t.frequency.value,
                "amount": float(t.amount),
                "due_day": t.due_day,
                "notes": t.notes,
                "category": t.category,
                "is_archived": t.is_archived,
                "is_paused": t.is_paused,
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
                "status": i.status.value,
                "paid_at": i.paid_at.isoformat() if i.paid_at else None,
                "paid_amount": float(i.paid_amount) if i.paid_amount else None,
                "notes": i.notes,
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
