from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfileOut(BaseModel):
    model_config = {"from_attributes": True}

    email: EmailStr
    language_preference: str | None
    email_reminders_enabled: bool
    notify_2_days_before: bool
    notify_1_day_before: bool
    notify_on_day: bool
    notify_1_day_after: bool
    reminder_send_minute: int


class UserProfileUpdate(BaseModel):
    language_preference: Literal["en", "pl", "de"] | None = None
    email_reminders_enabled: bool | None = None
    notify_2_days_before: bool | None = None
    notify_1_day_before: bool | None = None
    notify_on_day: bool | None = None
    notify_1_day_after: bool | None = None
    reminder_send_minute: Annotated[int, Field(ge=0, le=1410)] | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class SendNotificationNowOut(BaseModel):
    sent: int
