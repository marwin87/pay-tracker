from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.models.bill import BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.schemas.bill import (
    BillTemplateCreate,
    BillTemplateOut,
    BillTemplateUpdate,
    MarkPaidRequest,
    PaymentInstanceOut,
)
from app.services.recurrence import generate_next_instance

# PRD §Access Control: flat household model — all authenticated users share one view.
# current_user is injected for auth enforcement only; no per-user data scoping is applied.
router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("", response_model=list[BillTemplateOut])
def list_bills(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    q = db.query(BillTemplate)
    if not include_archived:
        q = q.filter(BillTemplate.is_archived.is_(False))
    return q.order_by(BillTemplate.name).all()


@router.post("", response_model=BillTemplateOut, status_code=status.HTTP_201_CREATED)
def create_bill(
    body: BillTemplateCreate,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    bill = BillTemplate(**body.model_dump())
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


# Literal-path routes declared before parameterized /{bill_id} routes to prevent
# FastAPI from matching "payments" as an integer bill_id.
@router.get("/payments", response_model=list[PaymentInstanceOut])
def list_payments(
    month: str | None = None,  # "YYYY-MM"
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    q = db.query(PaymentInstance)
    if month:
        q = q.filter(PaymentInstance.period == month)
    return q.order_by(PaymentInstance.due_date).all()


@router.post("/payments/{instance_id}/pay", response_model=PaymentInstanceOut)
def mark_paid(
    instance_id: int,
    body: MarkPaidRequest,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    instance = db.get(PaymentInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Payment instance not found")

    template = instance.template  # read before commit; expire_on_commit would force a lazy re-load after
    instance.status = PaymentStatus.paid
    instance.paid_at = datetime.now(timezone.utc)
    instance.paid_amount = body.paid_amount if body.paid_amount is not None else instance.amount
    if body.notes:
        instance.notes = body.notes
    db.commit()

    # auto-create next period instance unless template is paused
    if not template.is_paused:
        generate_next_instance(db, template, instance.period)

    db.refresh(instance)
    return instance


@router.patch("/{bill_id}", response_model=BillTemplateOut)
def update_bill(
    bill_id: int,
    body: BillTemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bill, field, value)
    db.commit()
    db.refresh(bill)
    return bill


@router.post("/{bill_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    bill.is_archived = True
    db.commit()
