from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.models import DeliveryBy, FssaiStatus, MediaKind, ReviewStatus
from app.services.phone import InvalidPhone, normalize_phone

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Story = Annotated[str, StringConstraints(strip_whitespace=True, max_length=280)]


def _phone(v: str | None) -> str | None:
    if v is None or not v.strip():
        return None
    try:
        return normalize_phone(v)
    except InvalidPhone as e:
        raise ValueError(str(e)) from None


class OnboardIn(BaseModel):
    display_name: Name
    story: Story = ""
    locality_id: int | None = None
    pincode: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4,10}$")] | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    address_line: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    whatsapp_phone: str | None = None

    _wa = field_validator("whatsapp_phone")(_phone)

    @model_validator(mode="after")
    def _where(self):
        if self.locality_id is None and not self.pincode:
            raise ValueError("Choose your locality or enter your pincode")
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Send both lat and lng, or neither")
        return self


class ProfileIn(BaseModel):
    display_name: Name | None = None
    story: Story | None = None
    whatsapp_phone: str | None = None
    address_line: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    _wa = field_validator("whatsapp_phone")(_phone)


class FulfilmentIn(BaseModel):
    offers_pickup: bool
    delivery_radius_km: float = Field(ge=0, le=10)
    delivery_by: DeliveryBy = DeliveryBy.self

    @model_validator(mode="after")
    def _some_way(self):
        if not self.offers_pickup and self.delivery_radius_km <= 0:
            raise ValueError("Offer pickup or delivery, otherwise no one can order")
        return self


class MediaOut(BaseModel):
    id: int
    kind: MediaKind
    is_private: bool
    path: str | None  # public files only; relative to /media
    is_pdf: bool
    created_at: datetime
    docs_advanced: bool = False


class FssaiPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: FssaiStatus
    application_id: str | None = None
    registration_number: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None


class VendorMeOut(BaseModel):
    onboarded: bool = True
    id: int | None = None
    display_name: str | None = None
    story: str | None = None
    phone: str | None = None
    whatsapp_phone: str | None = None
    locality_id: int | None = None
    locality_name: str | None = None
    pincode: str | None = None
    lat: float | None = None
    lng: float | None = None
    address_line: str | None = None
    review_status: ReviewStatus | None = None
    review_note: str | None = None
    offers_pickup: bool | None = None
    delivery_radius_km: float | None = None
    delivery_by: DeliveryBy | None = None
    is_live: bool = False
    fssai: FssaiPublicOut | None = None
    media: list[MediaOut] = []
    docs_complete: bool = False
    missing_docs: list[MediaKind] = []


class FssaiIn(BaseModel):
    status: FssaiStatus
    application_id: Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None = None
    registration_number: Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.issue_date and self.expiry_date and self.expiry_date < self.issue_date:
            raise ValueError("Expiry date cannot be before the issue date")
        if self.status == FssaiStatus.registration_issued and (not self.registration_number or not self.issue_date):
            raise ValueError("Registration number and issue date are required when registration is issued")
        return self


class NoteIn(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


class OverrideIn(BaseModel):
    enabled: bool
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]


class LocalityIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    pincode: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4,10}$")]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
