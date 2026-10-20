"""Admin API. Every state-changing action writes an AuditLog row (entity='vendor', entity_id=vendor.id for vendor actions)."""
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.deps import DbDep, require_role
from app.models import (
    AuditLog, FssaiRecord, FssaiStatus, Locality, ReviewStatus, Role, User, Vendor, VendorMedia,
)
from app.schemas.locality import LocalityOut
from app.schemas.vendor import FssaiIn, LocalityIn, NoteIn, OverrideIn
from app.db import utcnow
from app.services import images
from app.services.audit import write_audit
from app.services.clock import local_today
from app.services.golive import is_vendor_live, live_vendor_filter
from app.services.sessions import delete_user_sessions
from app.services.vendors import PRIVATE_DOC_KINDS, locality_name, media_out, missing_docs

AdminUser = Annotated[User, Depends(require_role(Role.admin))]
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_role(Role.admin))])

EXPIRY_WARN_DAYS = 60


def _vendor_or_404(db, vendor_id: int) -> Vendor:
    v = db.get(Vendor, vendor_id)
    if v is None:
        raise HTTPException(404, "Vendor not found")
    return v


def _fssai_dict(f: FssaiRecord | None) -> dict | None:
    if f is None:
        return None
    return {
        "status": f.status, "application_id": f.application_id, "registration_number": f.registration_number,
        "issue_date": f.issue_date, "expiry_date": f.expiry_date, "notes": f.notes, "updated_at": f.updated_at,
    }


def _fssai_snapshot(f: FssaiRecord) -> dict:
    d = _fssai_dict(f)
    return {k: (v.isoformat() if hasattr(v, "isoformat") else getattr(v, "value", v)) for k, v in d.items() if k != "updated_at"}


def _days_left(f: FssaiRecord | None, today) -> int | None:
    return (f.expiry_date - today).days if f and f.expiry_date else None


def _vendor_row(db, v: Vendor, user: User | None, today) -> dict:
    f = v.fssai
    return {
        "id": v.id, "display_name": v.display_name, "phone": user.phone if user else None,
        "locality_name": locality_name(db, v), "pincode": v.pincode, "review_status": v.review_status,
        "is_live": is_vendor_live(v, f, today), "live_override": v.live_override,
        "fssai_status": f.status if f else None, "fssai_expiry": f.expiry_date if f else None,
        "fssai_days_left": _days_left(f, today), "docs_complete": not missing_docs(v),
        "docs_count": 3 - len(missing_docs(v)), "created_at": v.created_at,
    }


# ---------------------------------------------------------------- dashboard
@router.get("/dashboard")
def dashboard(db: DbDep):
    today = local_today()
    pending = db.scalar(select(func.count()).select_from(Vendor).where(Vendor.review_status == ReviewStatus.pending))
    live = db.scalar(select(func.count()).select_from(Vendor).where(live_vendor_filter(today)))
    active = db.scalar(select(func.count()).select_from(Vendor).where(Vendor.review_status == ReviewStatus.approved))
    expiring = db.scalar(select(func.count()).select_from(FssaiRecord).where(
        FssaiRecord.status == FssaiStatus.registration_issued,
        FssaiRecord.expiry_date.is_not(None),
        FssaiRecord.expiry_date <= today + timedelta(days=EXPIRY_WARN_DAYS),
    ))
    return {
        "active_vendors": active, "live_vendors": live, "pending_vendors": pending,
        "fssai_expiring_60d": expiring,
        # Filled in by the orders phase:
        "orders_today": 0, "orders_this_week": 0, "repeat_customer_rate": 0.0,
    }


# ---------------------------------------------------------------- vendors
@router.get("/vendors")
def list_vendors(db: DbDep, status: ReviewStatus | None = None, q: Annotated[str | None, Query(max_length=100)] = None):
    today = local_today()
    stmt = select(Vendor, User).join(User, User.id == Vendor.user_id)
    if status:
        stmt = stmt.where(Vendor.review_status == status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Vendor.display_name.ilike(like), User.phone.ilike(like), Vendor.pincode.ilike(like)))
    rows = db.execute(stmt.order_by(Vendor.created_at.desc()).limit(300)).all()
    return [_vendor_row(db, v, u, today) for v, u in rows]


@router.get("/vendors/{vendor_id}")
def vendor_detail(vendor_id: int, db: DbDep):
    v = _vendor_or_404(db, vendor_id)
    today = local_today()
    user = db.get(User, v.user_id)
    row = _vendor_row(db, v, user, today)
    media = []
    for m in sorted(v.media, key=lambda m: m.id):
        d = media_out(m, include_private_path=True)
        d["admin_url"] = f"/api/v1/admin/media/{m.id}"
        media.append(d)
    return {
        **row, "story": v.story, "address_line": v.address_line, "whatsapp_phone": v.whatsapp_phone,
        "locality_id": v.locality_id, "lat": v.lat, "lng": v.lng, "review_note": v.review_note,
        "offers_pickup": v.offers_pickup, "delivery_radius_km": v.delivery_radius_km,
        "live_override_reason": v.live_override_reason, "approved_at": v.approved_at,
        "user": {"id": user.id, "name": user.name, "phone": user.phone} if user else None,
        "fssai": _fssai_dict(v.fssai), "media": media, "missing_docs": missing_docs(v),
    }


def _review_action(db, admin: User, vendor_id: int, action: str, new_status: ReviewStatus,
                   allowed_from: set[ReviewStatus], note: str, note_required: bool = False) -> dict:
    v = _vendor_or_404(db, vendor_id)
    if note_required and len(note) < 3:
        raise HTTPException(422, "Please write a note for the vendor")
    if v.review_status not in allowed_from:
        raise HTTPException(409, f"Can't {action} a vendor who is {v.review_status.value}")
    before = {"review_status": v.review_status.value, "review_note": v.review_note}
    v.review_status = new_status
    v.review_note = note or None
    if new_status == ReviewStatus.approved and v.approved_at is None:
        v.approved_at = utcnow()
    write_audit(db, admin.id, f"vendor.{action}", "vendor", v.id,
                {"before": before, "after": {"review_status": new_status.value, "review_note": v.review_note}})
    db.commit()
    if new_status == ReviewStatus.suspended:
        delete_user_sessions(db, v.user_id)  # instant revoke
    return {"id": v.id, "review_status": v.review_status, "is_live": is_vendor_live(v, v.fssai, local_today())}


@router.post("/vendors/{vendor_id}/approve")
def approve(vendor_id: int, admin: AdminUser, db: DbDep, body: NoteIn = NoteIn()):
    return _review_action(db, admin, vendor_id, "approve", ReviewStatus.approved,
                          {ReviewStatus.pending, ReviewStatus.rejected}, body.note)


@router.post("/vendors/{vendor_id}/reject")
def reject(vendor_id: int, body: NoteIn, admin: AdminUser, db: DbDep):
    return _review_action(db, admin, vendor_id, "reject", ReviewStatus.rejected,
                          {ReviewStatus.pending, ReviewStatus.approved}, body.note, note_required=True)


@router.post("/vendors/{vendor_id}/suspend")
def suspend(vendor_id: int, admin: AdminUser, db: DbDep, body: NoteIn = NoteIn()):
    return _review_action(db, admin, vendor_id, "suspend", ReviewStatus.suspended,
                          {ReviewStatus.pending, ReviewStatus.approved, ReviewStatus.rejected}, body.note)


@router.post("/vendors/{vendor_id}/unsuspend")
def unsuspend(vendor_id: int, admin: AdminUser, db: DbDep, body: NoteIn = NoteIn()):
    v = _vendor_or_404(db, vendor_id)
    target = ReviewStatus.approved if v.approved_at else ReviewStatus.pending  # never approved -> back to queue
    return _review_action(db, admin, vendor_id, "unsuspend", target, {ReviewStatus.suspended}, body.note)


@router.put("/vendors/{vendor_id}/fssai")
def update_fssai(vendor_id: int, body: FssaiIn, admin: AdminUser, db: DbDep):
    v = _vendor_or_404(db, vendor_id)
    f = v.fssai
    if f is None:
        f = FssaiRecord(vendor_id=v.id)
        db.add(f)
        v.fssai = f
        db.flush()
    before = _fssai_snapshot(f)
    for key, val in body.model_dump().items():
        setattr(f, key, val)
    f.updated_at = utcnow()
    write_audit(db, admin.id, "vendor.fssai_update", "vendor", v.id, {"before": before, "after": _fssai_snapshot(f)})
    db.commit()
    return {"fssai": _fssai_dict(f), "is_live": is_vendor_live(v, f, local_today())}


@router.put("/vendors/{vendor_id}/override")
def set_override(vendor_id: int, body: OverrideIn, admin: AdminUser, db: DbDep):
    v = _vendor_or_404(db, vendor_id)
    before = {"live_override": v.live_override, "reason": v.live_override_reason}
    v.live_override = body.enabled
    v.live_override_reason = body.reason
    write_audit(db, admin.id, "vendor.override", "vendor", v.id,
                {"before": before, "after": {"live_override": body.enabled, "reason": body.reason}})
    db.commit()
    return {"live_override": v.live_override, "live_override_reason": v.live_override_reason,
            "is_live": is_vendor_live(v, v.fssai, local_today())}


# ---------------------------------------------------------------- FSSAI tracker
@router.get("/fssai")
def fssai_tracker(db: DbDep, expiring_within: Annotated[int | None, Query(ge=0, le=3650)] = None):
    today = local_today()
    stmt = select(FssaiRecord, Vendor).join(Vendor, Vendor.id == FssaiRecord.vendor_id)
    if expiring_within is not None:
        stmt = stmt.where(FssaiRecord.expiry_date.is_not(None),
                          FssaiRecord.expiry_date <= today + timedelta(days=expiring_within))
    stmt = stmt.order_by(FssaiRecord.expiry_date.is_(None), FssaiRecord.expiry_date, Vendor.id)
    return [
        {
            "vendor_id": v.id, "display_name": v.display_name, "review_status": v.review_status,
            "is_live": is_vendor_live(v, f, today), **{k: val for k, val in _fssai_dict(f).items()},
            "days_left": _days_left(f, today),
        }
        for f, v in db.execute(stmt).all()
    ]


# ---------------------------------------------------------------- audit
@router.get("/audit")
def audit_log(db: DbDep, page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=200)] = 50,
              entity: str | None = None, entity_id: int | None = None):
    base = select(AuditLog)
    if entity:
        base = base.where(AuditLog.entity == entity)
    if entity_id is not None:
        base = base.where(AuditLog.entity_id == entity_id)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.execute(
        base.add_columns(User.name, User.email, User.phone).outerjoin(User, User.id == AuditLog.actor_id)
        .order_by(AuditLog.id.desc()).limit(page_size).offset((page - 1) * page_size)
    ).all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [
            {"id": a.id, "action": a.action, "entity": a.entity, "entity_id": a.entity_id, "details": a.details,
             "created_at": a.created_at, "actor_id": a.actor_id, "actor": name or email or phone}
            for a, name, email, phone in rows
        ],
    }


# ---------------------------------------------------------------- media (private files)
@router.get("/media/{media_id}")
def get_media(media_id: int, db: DbDep):
    m = db.get(VendorMedia, media_id)
    full = images.resolve_path(m.path, m.is_private) if m else None
    if m is None or full is None or not full.is_file():
        raise HTTPException(404, "File not found")
    ctype = "application/pdf" if m.path.lower().endswith(".pdf") else "image/jpeg"
    return FileResponse(full, media_type=ctype, headers={
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
    })


# ---------------------------------------------------------------- localities
@router.post("/localities", response_model=LocalityOut, status_code=201)
def create_locality(body: LocalityIn, admin: AdminUser, db: DbDep):
    loc = Locality(**body.model_dump())
    db.add(loc)
    db.flush()
    write_audit(db, admin.id, "locality.create", "locality", loc.id, body.model_dump())
    db.commit()
    return loc
