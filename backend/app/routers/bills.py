from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

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
from app.services.recurrence import (
    _due_date_for_period,
    ensure_current_period_instances,
    generate_next_instance,
)

router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("", response_model=list[BillTemplateOut])
def list_bills(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    q = db.query(BillTemplate).filter(BillTemplate.user_id == me.id)
    if not include_archived:
        q = q.filter(BillTemplate.is_archived.is_(False))
    return q.order_by(BillTemplate.name).all()


@router.post("", response_model=BillTemplateOut, status_code=status.HTTP_201_CREATED)
def create_bill(
    body: BillTemplateCreate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    now = datetime.now(timezone.utc)
    bill = BillTemplate(
        **body.model_dump(), user_id=me.id, start_period=now.strftime("%Y-%m")
    )
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
    me: User = Depends(current_user),
):
    today = date.today()
    current_month = today.strftime("%Y-%m")
    if month is None:
        month = current_month

    # Seed current and future months; skip past to avoid retroactive overdue flooding
    if month >= current_month:
        ensure_current_period_instances(db, month, me.id)

    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == me.id,
            PaymentInstance.period == month,
            PaymentInstance.is_deleted.is_(False),
        )
        .order_by(PaymentInstance.due_date)
        .all()
    )

    result = []
    for inst in instances:
        d = {
            "id": inst.id,
            "bill_id": inst.bill_id,
            "period": inst.period,
            "due_date": inst.due_date,
            "amount": inst.amount,
            "status": inst.status,
            "paid_at": inst.paid_at,
            "paid_amount": inst.paid_amount,
            "notes": inst.notes,
            "bill_name": inst.template.name,
            "currency": inst.template.currency,
            "frequency": inst.template.frequency,
            "email_sent_at": inst.email_sent_at,
        }
        # Dynamic overdue: override status in response without writing to DB
        if inst.status == PaymentStatus.upcoming and inst.due_date < today:
            d["status"] = PaymentStatus.overdue
        result.append(d)
    return result


@router.post("/payments/{instance_id}/pay", response_model=PaymentInstanceOut)
def mark_paid(
    instance_id: int,
    body: MarkPaidRequest,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = db.get(PaymentInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Payment instance not found")

    template = (
        instance.template
    )  # read before commit; expire_on_commit would force a lazy re-load after
    if template.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    instance.status = PaymentStatus.paid
    instance.paid_at = datetime.now(timezone.utc)
    instance.paid_amount = (
        body.paid_amount if body.paid_amount is not None else instance.amount
    )
    if body.notes:
        instance.notes = body.notes
    db.commit()

    # auto-create next period instance unless template is paused
    if not template.is_paused:
        generate_next_instance(db, template, instance.period)

    db.refresh(instance)
    return {
        "id": instance.id,
        "bill_id": instance.bill_id,
        "period": instance.period,
        "due_date": instance.due_date,
        "amount": instance.amount,
        "status": instance.status,
        "paid_at": instance.paid_at,
        "paid_amount": instance.paid_amount,
        "notes": instance.notes,
        "bill_name": template.name,
        "currency": template.currency,
        "frequency": template.frequency,
        "email_sent_at": instance.email_sent_at,
    }


@router.post("/payments/{instance_id}/unpay", response_model=PaymentInstanceOut)
def revert_payment(
    instance_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = db.get(PaymentInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Payment instance not found")
    template = instance.template
    if template.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if instance.status != PaymentStatus.paid:
        raise HTTPException(status_code=400, detail="Payment is not marked as paid")

    today = date.today()
    instance.status = (
        PaymentStatus.overdue if instance.due_date < today else PaymentStatus.upcoming
    )
    instance.paid_at = None
    instance.paid_amount = None
    db.commit()
    db.refresh(instance)
    return {
        "id": instance.id,
        "bill_id": instance.bill_id,
        "period": instance.period,
        "due_date": instance.due_date,
        "amount": instance.amount,
        "status": instance.status,
        "paid_at": instance.paid_at,
        "paid_amount": instance.paid_amount,
        "notes": instance.notes,
        "bill_name": template.name,
        "currency": template.currency,
        "frequency": template.frequency,
        "email_sent_at": instance.email_sent_at,
    }


@router.delete("/payments/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(
    instance_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = db.get(PaymentInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Payment instance not found")

    template = instance.template
    if template.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    instance.is_deleted = True
    db.commit()


@router.patch("/{bill_id}", response_model=BillTemplateOut)
def update_bill(
    bill_id: int,
    body: BillTemplateUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = body.model_dump(exclude_unset=True)
    due_day_changed = "due_day" in updates and updates["due_day"] != bill.due_day
    for field, value in updates.items():
        setattr(bill, field, value)

    if due_day_changed:
        unpaid = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id == bill.id,
                PaymentInstance.status != PaymentStatus.paid,
                PaymentInstance.is_deleted.is_(False),
            )
            .all()
        )
        for inst in unpaid:
            inst.due_date = _due_date_for_period(inst.period, bill.due_day)

    db.commit()
    db.refresh(bill)
    return bill


@router.post("/{bill_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    bill.is_archived = True
    db.commit()
