from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Role
from app.services.phone import InvalidPhone, normalize_phone


class OtpRequest(BaseModel):
    phone: str
    role: Role

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        try:
            return normalize_phone(v)
        except InvalidPhone as e:
            raise ValueError(str(e)) from None

    @field_validator("role")
    @classmethod
    def _role(cls, v: Role) -> Role:
        if v not in (Role.customer, Role.vendor):
            raise ValueError("Phone login is for customers and cooks only")
        return v


class OtpVerify(OtpRequest):
    code: str = Field(min_length=4, max_length=10)


class PasswordLogin(OtpRequest):
    password: str = Field(min_length=1, max_length=200)


class InviteIn(OtpRequest):
    """Admin creates a customer/cook (or resets their password) for invite-only login."""

    name: str = Field(default="", max_length=120)
    password: str = Field(min_length=8, max_length=200)


class InvitedUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Role
    phone: str | None = None
    name: str
    has_password: bool
    created_at: datetime


class AuthConfigOut(BaseModel):
    mode: str


class AdminLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Role
    phone: str | None = None
    email: str | None = None
    name: str
    address_line: str | None = None
    pincode: str | None = None
    lat: float | None = None
    lng: float | None = None


class OkOut(BaseModel):
    ok: bool = True
