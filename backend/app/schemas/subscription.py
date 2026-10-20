import datetime as dt
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.models import Diet, Fulfilment, Slot

Str = StringConstraints(strip_whitespace=True)


class PlanIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    slot: Slot
    days_of_week: list[int] = Field(min_length=1, max_length=7)  # 0-6, Mon=0
    price_per_week: int = Field(ge=1000, le=10_000_000, description="paise")
    diet: Diet = Diet.veg
    active: bool = True
    cutoff_hours_before: int = Field(default=12, ge=1, le=48)

    @field_validator("days_of_week")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Days must be 0 (Monday) to 6 (Sunday)")
        return sorted(set(v))

    @field_validator("description")
    @classmethod
    def _blank(cls, v: str | None) -> str | None:
        return v or None


class PlanUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=160)] | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    slot: Slot | None = None
    days_of_week: list[int] | None = Field(default=None, min_length=1, max_length=7)
    price_per_week: int | None = Field(default=None, ge=1000, le=10_000_000)
    diet: Diet | None = None
    active: bool | None = None
    cutoff_hours_before: int | None = Field(default=None, ge=1, le=48)

    @field_validator("days_of_week")
    @classmethod
    def _days(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return v
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Days must be 0 (Monday) to 6 (Sunday)")
        return sorted(set(v))


class SubscribeIn(BaseModel):
    plan_id: int
    start_date: dt.date
    weeks: int = Field(ge=1, le=8)
    fulfilment: Fulfilment
    delivery_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)] | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("delivery_address")
    @classmethod
    def _blank(cls, v: str | None) -> str | None:
        return v or None

    @model_validator(mode="after")
    def _check(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Send both lat and lng, or neither")
        return self


class PauseIn(BaseModel):
    until: dt.date | None = None  # first day meals resume; omit to pause indefinitely


class SkipIn(BaseModel):
    date: dt.date


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=280)] = ""


class ComplaintIn(BaseModel):
    order_id: int | None = None
    vendor_id: int
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]


class ComplaintUpdate(BaseModel):
    status: str = Field(pattern="^(open|resolved)$")
    admin_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
