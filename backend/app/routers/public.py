from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.deps import DbDep
from app.models import Diet, Locality, Slot, Vendor
from app.schemas.locality import LocalityOut
from app.services import clock, discovery
from app.services.golive import is_vendor_live

router = APIRouter(tags=["public"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/localities", response_model=list[LocalityOut])
def list_localities(db: DbDep):
    return db.scalars(select(Locality).order_by(Locality.city, Locality.name)).all()


@router.get("/vendors")
def list_vendors(
    db: DbDep,
    pincode: Annotated[str | None, Query(pattern=r"^\d{4,10}$")] = None,
    locality_id: int | None = None,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    date: date | None = None,
    slot: Slot | None = None,
    diet: Diet | None = None,
):
    """Live cooks near the customer, nearest first. Needs lat+lng, a locality, or a pincode."""
    if (lat is None) != (lng is None):
        raise HTTPException(422, "Send both lat and lng, or neither")
    ref = discovery.resolve_reference(db, lat=lat, lng=lng, pincode=pincode, locality_id=locality_id)
    if ref.is_empty():
        raise HTTPException(422, "Tell us your area: send lat and lng, a locality, or a pincode")
    return discovery.list_vendors(db, ref=ref, day=date, slot=slot, diet=diet)


@router.get("/vendors/{vendor_id}")
def vendor_profile(
    vendor_id: int,
    db: DbDep,
    date: date | None = None,
    slot: Slot | None = None,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
):
    v = db.get(Vendor, vendor_id)
    if v is None or not is_vendor_live(v, v.fssai, clock.local_today()):
        raise HTTPException(404, "Cook not found")
    point = (lat, lng) if lat is not None and lng is not None else None
    return discovery.vendor_profile(db, v, day=date, slot=slot, point=point)
