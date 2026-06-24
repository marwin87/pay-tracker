from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    SendMonthlySummaryNowOut,
    SendNotificationNowOut,
    TokenResponse,
    UserProfileOut,
    UserProfileUpdate,
)
from app.services.reminder_job import (
    send_monthly_summary_for_user,
    send_reminders_for_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT as an HttpOnly cookie plus a non-HttpOnly presence flag."""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )
    # Non-HttpOnly presence flag so the frontend can detect login state without XSS risk.
    response.set_cookie(
        key="auth_logged_in",
        value="1",
        httponly=False,
        samesite="lax",
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="auth_logged_in", path="/")


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserProfileOut)
def get_me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserProfileOut)
def update_me(
    body: UserProfileUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # UserProfileUpdate is the security boundary — only fields declared there are patchable.
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 8 characters",
        )
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.post("/send-notification-now", response_model=SendNotificationNowOut)
def send_notification_now(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if settings.smtp_host is None:
        raise HTTPException(status_code=400, detail="SMTP not configured")
    if not user.email_reminders_enabled:
        return SendNotificationNowOut(sent=0)
    sent = send_reminders_for_user(db, user)
    return SendNotificationNowOut(sent=sent)


@router.post("/send-monthly-summary-now", response_model=SendMonthlySummaryNowOut)
def send_monthly_summary_now(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if settings.smtp_host is None:
        raise HTTPException(status_code=400, detail="SMTP not configured")
    if not user.email_reminders_enabled or not user.monthly_summary_enabled:
        return SendMonthlySummaryNowOut(sent=False)
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    sent = send_monthly_summary_for_user(db, user, current_month)
    if sent:
        user.monthly_summary_last_sent = current_month
        db.commit()
    return SendMonthlySummaryNowOut(sent=sent)


@router.get("/server-time")
def server_time(_: User = Depends(current_user)):
    return {"server_time": datetime.now(timezone.utc).isoformat()}


@router.patch("/change-email", response_model=UserProfileOut)
def change_email(
    body: ChangeEmailRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    existing = db.query(User).filter(User.email == body.new_email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user.email = body.new_email
    db.commit()
    db.refresh(user)
    return user
