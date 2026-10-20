import datetime as dt
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.models import Diet, Fulfilment, PaymentMethod, Slot

MAX_ITEM_QTY = 10
Text300 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class OrderItemIn(BaseModel):
    offering_id: int
    qty: int = Field(ge=1, le=MAX_ITEM_QTY)


class OrderIn(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1, max_length=20)
    fulfilment: Fulfilment
    # Optional cross-checks: the server derives vendor/date/slot from the dishes and rejects a mismatch.
    vendor_id: int | None = None
    date: dt.date | None = None
    slot: Slot | None = None
    delivery_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)] | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    note: Text300 | None = None
    payment_method: PaymentMethod = PaymentMethod.cod

    @field_validator("note", "delivery_address")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        return v or None

    @model_validator(mode="after")
    def _check(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Send both lat and lng, or neither")
        ids = [i.offering_id for i in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each dish can appear only once; change its quantity instead")
        return self


class CancelIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""


class VendorCancelIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]


class ProfileUpdateIn(BaseModel):
    """PUT /me for customers: only the fields sent are changed."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None
    address_line: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    pincode: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4,10}$")] | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class CopyIn(BaseModel):
    from_date: dt.date
    to_dates: list[dt.date] = Field(min_length=1, max_length=14)
    slot: Slot | None = None


CutoffPresetId = Literal["1h", "2h", "3h", "night_before_9pm", "morning_10am"]


class OfferingIn(BaseModel):
    dish_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    slot: Slot
    dates: list[dt.date] = Field(min_length=1, max_length=14)
    price: int = Field(ge=100, le=1_000_000, description="paise")
    diet: Diet = Diet.veg
    portions_total: int = Field(ge=1, le=500)
    cutoff_preset: CutoffPresetId | None = None  # default "2h" before the slot starts
    cutoff_time: Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")] | None = None  # local HH:MM same day


class OfferingUpdate(BaseModel):
    dish_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)] | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    price: int | None = Field(default=None, ge=100, le=1_000_000)
    diet: Diet | None = None
    portions_total: int | None = Field(default=None, ge=0, le=500)
    cutoff_preset: CutoffPresetId | None = None
    cutoff_time: Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")] | None = None
    slot: Slot | None = None  # accepted only if unchanged (dishes can't move between slots/dates)
    date: dt.date | None = None


