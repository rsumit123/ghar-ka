from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import DbDep, require_role, require_xhr_header
from app.models import Locality, MediaKind, ReviewStatus, Role, User, Vendor, VendorMedia
from app.schemas.vendor import FulfilmentIn, MediaOut, OnboardIn, ProfileIn, VendorMeOut
from app.services import images
from app.services.audit import write_audit
from app.services.vendors import (
    MAX_KITCHEN_PHOTOS, advance_docs_if_complete, get_vendor_for_user, locality_name, media_out, missing_docs,
    new_fssai, vendor_is_live,
)

router = APIRouter(prefix="/vendor", tags=["vendor"])
VendorUser = Annotated[User, Depends(require_role(Role.vendor))]


def _require_vendor(db, user: User) -> Vendor:
    vendor = get_vendor_for_user(db, user.id)
    if vendor is None:
        raise HTTPException(404, "Finish setting up your kitchen first")
    return vendor


def _me(db, user: User, vendor: Vendor | None) -> dict:
    if vendor is None:
        return {"onboarded": False, "phone": user.phone}
    miss = missing_docs(vendor)
    return {
        "onboarded": True, "id": vendor.id, "display_name": vendor.display_name, "story": vendor.story,
        "phone": user.phone, "whatsapp_phone": vendor.whatsapp_phone, "locality_id": vendor.locality_id,
        "locality_name": locality_name(db, vendor), "pincode": vendor.pincode, "lat": vendor.lat, "lng": vendor.lng,
        "address_line": vendor.address_line, "review_status": vendor.review_status, "review_note": vendor.review_note,
        "offers_pickup": vendor.offers_pickup, "delivery_radius_km": vendor.delivery_radius_km,
        "is_live": vendor_is_live(vendor), "fssai": vendor.fssai,
        "media": [media_out(m) for m in sorted(vendor.media, key=lambda m: m.id)],
        "docs_complete": not miss, "missing_docs": miss,
    }


def _resubmit_if_rejected(db, vendor: Vendor, user: User) -> None:
    if vendor.review_status == ReviewStatus.rejected:
        vendor.review_status = ReviewStatus.pending
        write_audit(db, user.id, "vendor.resubmit", "vendor", vendor.id,
                    {"before": {"review_status": "rejected"}, "after": {"review_status": "pending"}})


@router.get("/me", response_model=VendorMeOut)
def get_me(user: VendorUser, db: DbDep):
    return _me(db, user, get_vendor_for_user(db, user.id))


@router.post("/onboard", response_model=VendorMeOut, status_code=201)
def onboard(body: OnboardIn, user: VendorUser, db: DbDep):
    if get_vendor_for_user(db, user.id):
        raise HTTPException(409, "You have already set up your kitchen")
    locality: Locality | None = None
    if body.locality_id is not None:
        locality = db.get(Locality, body.locality_id)
        if locality is None:
            raise HTTPException(422, "Unknown locality")
    elif body.pincode:
        locality = db.scalar(select(Locality).where(Locality.pincode == body.pincode).order_by(Locality.id))
    lat, lng = (body.lat, body.lng) if body.lat is not None else ((locality.lat, locality.lng) if locality else (None, None))
    vendor = Vendor(
        user_id=user.id, display_name=body.display_name, story=body.story,
        locality_id=locality.id if locality else None,
        pincode=locality.pincode if locality else body.pincode,
        lat=lat, lng=lng, address_line=body.address_line,
        whatsapp_phone=body.whatsapp_phone or user.phone,
        review_status=ReviewStatus.pending,
    )
    vendor.fssai = new_fssai()
    db.add(vendor)
    if not user.name:
        user.name = body.display_name
    try:
        db.flush()
        write_audit(db, user.id, "vendor.onboard", "vendor", vendor.id, {"display_name": vendor.display_name})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You have already set up your kitchen") from None
    return _me(db, user, vendor)


@router.put("/profile", response_model=VendorMeOut)
def update_profile(body: ProfileIn, user: VendorUser, db: DbDep):
    vendor = _require_vendor(db, user)
    data = body.model_dump(exclude_unset=True)
    if ("lat" in data or "lng" in data) and (data.get("lat") is None) != (data.get("lng") is None):
        raise HTTPException(422, "Send both lat and lng")
    for key, val in data.items():
        if key in ("display_name",) and val is None:
            continue
        setattr(vendor, key, val)
    _resubmit_if_rejected(db, vendor, user)
    db.commit()
    return _me(db, user, vendor)


@router.put("/fulfilment", response_model=VendorMeOut)
def update_fulfilment(body: FulfilmentIn, user: VendorUser, db: DbDep):
    vendor = _require_vendor(db, user)
    vendor.offers_pickup = body.offers_pickup
    vendor.delivery_radius_km = body.delivery_radius_km
    db.commit()
    return _me(db, user, vendor)


@router.post("/resubmit", response_model=VendorMeOut)
def resubmit(user: VendorUser, db: DbDep):
    vendor = _require_vendor(db, user)
    if vendor.review_status != ReviewStatus.rejected:
        raise HTTPException(409, "Nothing to resubmit")
    _resubmit_if_rejected(db, vendor, user)
    db.commit()
    return _me(db, user, vendor)


@router.post("/media", response_model=MediaOut, status_code=201, dependencies=[Depends(require_xhr_header)])
def upload_media(user: VendorUser, db: DbDep, kind: Annotated[MediaKind, Form()], file: UploadFile):
    vendor = _require_vendor(db, user)
    if kind == MediaKind.dish:
        raise HTTPException(422, "Dish photos are added with menu items")
    existing = [m for m in vendor.media if m.kind == kind]
    if kind == MediaKind.kitchen and len(existing) >= MAX_KITCHEN_PHOTOS:
        raise HTTPException(422, f"You can add up to {MAX_KITCHEN_PHOTOS} kitchen photos")
    try:
        stored = images.save_upload(file.file, subdir=f"v{vendor.id}", private=kind.is_private, allow_pdf=kind.is_private)
    except images.UploadError as e:
        raise HTTPException(e.status_code, e.detail) from None

    media = VendorMedia(vendor_id=vendor.id, kind=kind, path=stored.path, is_private=stored.is_private)
    db.add(media)
    replaced = [] if kind == MediaKind.kitchen else existing  # profile + each private doc: one file per kind
    for old in replaced:
        vendor.media.remove(old)
        db.delete(old)
    db.flush()
    vendor.media.append(media)
    advanced = advance_docs_if_complete(db, vendor, user.id)
    db.commit()
    for old in replaced:
        images.delete_stored(old.path, old.is_private)
    out = media_out(media)
    out["docs_advanced"] = advanced
    return out


@router.delete("/media/{media_id}", status_code=204)
def delete_media(media_id: int, user: VendorUser, db: DbDep):
    vendor = _require_vendor(db, user)
    media = db.get(VendorMedia, media_id)
    if media is None or media.vendor_id != vendor.id:
        raise HTTPException(404, "Photo not found")
    path, private = media.path, media.is_private
    vendor.media.remove(media)
    db.delete(media)
    db.commit()
    images.delete_stored(path, private)
