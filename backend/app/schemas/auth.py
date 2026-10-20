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
            raise ValueError("OTP login is for customers and vendors only")
        return v


class OtpVerify(OtpRequest):
    code: str = Field(min_length=4, max_length=10)


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
