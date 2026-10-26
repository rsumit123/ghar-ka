"""Admin API. Every state-changing action writes an AuditLog row (entity='vendor', entity_id=vendor.id for vendor actions)."""
import datetime as dt
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.deps import DbDep, require_role
from app.models import (
    AuditLog, Complaint, ComplaintStatus, FssaiRecord, FssaiStatus, Locality, Order, OrderStatus, ReviewStatus, Role,
    Subscription, SubscriptionStatus, User, Vendor, VendorMedia,
)
from app.schemas.auth import InvitedUserOut, InviteIn
from app.schemas.subscription import ComplaintUpdate
from app.schemas.locality import LocalityOut
from app.schemas.vendor import FssaiIn, LocalityIn, NoteIn, OverrideIn
from app.db import utcnow
from app.services import images
from app.services.audit import write_audit
from app.services.clock import local_today
from app.services.subscriptions import end_date as sub_end_date
from app.services.golive import is_vendor_live, live_vendor_filter
from app.services.security import hash_password
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
    week_start = today - timedelta(days=today.weekday())  # Monday
    live_orders = Order.status != OrderStatus.cancelled

    def orders_between(lo, hi) -> int:
        return db.scalar(select(func.count()).select_from(Order).where(live_orders, Order.date >= lo, Order.date <= hi)) or 0

    # Repeat customers: >=2 completed orders / >=1 completed orders. None when nobody has completed an order yet.
    per_customer = (
        select(Order.customer_id, func.count().label("n")).where(Order.status == OrderStatus.completed)
        .group_by(Order.customer_id).subquery()
    )
    served = db.scalar(select(func.count()).select_from(per_customer)) or 0
    repeat = db.scalar(select(func.count()).select_from(per_customer).where(per_customer.c.n >= 2)) or 0

    series_start = today - timedelta(days=13)
    by_day = dict(db.execute(
        select(Order.date, func.count()).where(live_orders, Order.date >= series_start, Order.date <= today)
        .group_by(Order.date)
    ).all())
    active_subs = sum(
        1 for sub in db.scalars(select(Subscription).where(Subscription.status == SubscriptionStatus.active))
        if sub_end_date(sub) >= today
    )
    return {
        "active_vendors": active, "live_vendors": live, "pending_vendors": pending,
        "fssai_expiring_60d": expiring,
        # Cancelled orders are not counted. Week = Monday..Sunday in APP_TIMEZONE.
        "orders_today": orders_between(today, today),
        "orders_this_week": orders_between(week_start, week_start + timedelta(days=6)),
        "repeat_customer_rate": (repeat / served) if served else None,
        "repeat_customers": repeat, "customers_served": served,
        "active_subscriptions": active_subs,
        "open_complaints": db.scalar(select(func.count()).select_from(Complaint).where(Complaint.status == ComplaintStatus.open)) or 0,
        "orders_per_day": [
            {"date": series_start + timedelta(days=i), "count": by_day.get(series_start + timedelta(days=i), 0)}
            for i in range(14)
        ],
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
        "offers_pickup": v.offers_pickup, "delivery_radius_km": v.delivery_radius_km, "delivery_by": v.delivery_by,
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


# ---------------------------------------------------------------- orders
@router.get("/orders")
def admin_orders(
    db: DbDep, vendor_id: int | None = None, date_from: dt.date | None = None, date_to: dt.date | None = None,
    status: OrderStatus | None = None, page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
):
    base = select(Order)
    if vendor_id is not None:
        base = base.where(Order.vendor_id == vendor_id)
    if date_from:
        base = base.where(Order.date >= date_from)
    if date_to:
        base = base.where(Order.date <= date_to)
    # Status counts respect the other filters but not the status filter itself (they label the filter chips).
    sub = base.subquery()
    counts = dict(db.execute(select(sub.c.status, func.count()).group_by(sub.c.status)).all())
    summary = {s.value: counts.get(s.value, 0) for s in OrderStatus}
    if status:
        base = base.where(Order.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(Order.date.desc(), Order.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
    customers = {u.id: u for u in db.scalars(select(User).where(User.id.in_({o.customer_id for o in rows})))} if rows else {}
    vendors = {v.id: v for v in db.scalars(select(Vendor).where(Vendor.id.in_({o.vendor_id for o in rows})))} if rows else {}
    return {
        "total": total, "page": page, "page_size": page_size, "summary": summary,
        "items": [
            {
                "id": o.id, "date": o.date, "slot": o.slot, "status": o.status, "fulfilment": o.fulfilment,
                "delivery_by": o.delivery_by,
                "total": o.total, "payment_method": o.payment_method, "payment_status": o.payment_status,
                "is_tiffin": o.subscription_id is not None, "created_at": o.created_at, "cancel_reason": o.cancel_reason,
                "customer": {"id": o.customer_id, "name": customers[o.customer_id].name if o.customer_id in customers else "",
                             "phone": customers[o.customer_id].phone if o.customer_id in customers else None},
                "vendor": {"id": o.vendor_id, "name": vendors[o.vendor_id].display_name if o.vendor_id in vendors else ""},
                "items": [{"name": i.name, "qty": i.qty, "unit_price": i.unit_price} for i in o.items],
            }
            for o in rows
        ],
    }


# ---------------------------------------------------------------- complaints
def _complaint_row(c: Complaint, customer: User | None, vendor: Vendor | None, order: Order | None) -> dict:
    return {
        "id": c.id, "text": c.text, "status": c.status, "admin_note": c.admin_note, "created_at": c.created_at,
        "customer": {"id": c.customer_id, "name": customer.name if customer else "", "phone": customer.phone if customer else None},
        "vendor": {"id": c.vendor_id, "name": vendor.display_name if vendor else ""},
        "order": {"id": order.id, "date": order.date, "slot": order.slot, "status": order.status, "total": order.total}
        if order else None,
    }


@router.get("/complaints")
def admin_complaints(db: DbDep, status: ComplaintStatus | None = None, page: Annotated[int, Query(ge=1)] = 1,
                     page_size: Annotated[int, Query(ge=1, le=100)] = 50):
    base = select(Complaint)
    counts = dict(db.execute(select(Complaint.status, func.count()).group_by(Complaint.status)).all())
    if status:
        base = base.where(Complaint.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(Complaint.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "summary": {s.value: counts.get(s.value, 0) for s in ComplaintStatus},
        "items": [
            _complaint_row(c, db.get(User, c.customer_id), db.get(Vendor, c.vendor_id),
                           db.get(Order, c.order_id) if c.order_id else None)
            for c in rows
        ],
    }


@router.put("/complaints/{complaint_id}")
def update_complaint(complaint_id: int, body: ComplaintUpdate, admin: AdminUser, db: DbDep):
    c = db.get(Complaint, complaint_id)
    if c is None:
        raise HTTPException(404, "Complaint not found")
    before = {"status": c.status.value, "admin_note": c.admin_note}
    c.status = ComplaintStatus(body.status)
    c.admin_note = body.admin_note or None
    write_audit(db, admin.id, "complaint.update", "complaint", c.id,
                {"vendor_id": c.vendor_id, "before": before, "after": {"status": c.status.value, "admin_note": c.admin_note}})
    db.commit()
    return _complaint_row(c, db.get(User, c.customer_id), db.get(Vendor, c.vendor_id),
                          db.get(Order, c.order_id) if c.order_id else None)


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


# ---------------------------------------------------------------- invited users (AUTH_MODE=password)
def _invited_out(u: User) -> InvitedUserOut:
    return InvitedUserOut(id=u.id, role=u.role, phone=u.phone, name=u.name,
                          has_password=bool(u.password_hash), created_at=u.created_at)


@router.get("/users", response_model=list[InvitedUserOut])
def list_users(db: DbDep, role: Role | None = None):
    q = select(User).where(User.role.in_([Role.customer, Role.vendor])).order_by(User.created_at.desc())
    if role is not None:
        q = q.where(User.role == role)
    return [_invited_out(u) for u in db.scalars(q)]


@router.post("/users", response_model=InvitedUserOut)
def invite_user(body: InviteIn, admin: AdminUser, db: DbDep):
    """Create a customer/cook with a password, or reset the password of an existing one (logs them out)."""
    user = db.execute(select(User).where(User.phone == body.phone, User.role == body.role)).scalar_one_or_none()
    created = user is None
    if created:
        user = User(role=body.role, phone=body.phone, name=body.name.strip())
        db.add(user)
    elif body.name.strip():
        user.name = body.name.strip()
    user.password_hash = hash_password(body.password)
    db.flush()
    if not created:
        delete_user_sessions(db, user.id)
    write_audit(db, admin.id, "user.invite" if created else "user.password_reset", "user", user.id,
                {"phone": body.phone, "role": body.role.value})
    db.commit()
    return _invited_out(user)
