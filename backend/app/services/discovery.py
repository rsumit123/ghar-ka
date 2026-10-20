"""Public vendor discovery: hyperlocal listing and profile."""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Diet, FssaiStatus, Locality, MediaKind, MenuOffering, Order, OrderStatus, Review, Slot, TiffinPlan, User, Vendor,
)
from app.services import clock
from app.services.distance import approx, haversine_km
from app.services.golive import live_vendor_filter
from app.services.menu import SLOT_ORDER, offering_public, slot_rank
from app.services.phone import digits_only

PROFILE_MENU_DAYS = 7
REVIEWS_ON_PROFILE = 20


class Reference:
    """Where the customer is: a precise point, a locality centroid, or just a pincode."""

    def __init__(self, lat: float | None, lng: float | None, pincode: str | None, locality_id: int | None, precise: bool):
        self.lat, self.lng, self.pincode, self.locality_id, self.precise = lat, lng, pincode, locality_id, precise

    @property
    def has_point(self) -> bool:
        return self.lat is not None and self.lng is not None

    def is_empty(self) -> bool:
        return not self.has_point and not self.pincode and self.locality_id is None


def resolve_reference(
    db: Session, *, lat: float | None, lng: float | None, pincode: str | None, locality_id: int | None
) -> Reference:
    loc: Locality | None = db.get(Locality, locality_id) if locality_id is not None else None
    if loc is None and pincode:
        loc = db.scalar(select(Locality).where(Locality.pincode == pincode).order_by(Locality.id))
    pin = pincode or (loc.pincode if loc else None)
    if lat is not None and lng is not None:
        return Reference(lat, lng, pin, loc.id if loc else None, True)
    if loc is not None:
        return Reference(loc.lat, loc.lng, pin, loc.id, False)
    return Reference(None, None, pin, None, False)


def distance_to(ref: Reference, v: Vendor) -> float | None:
    if not ref.has_point or v.lat is None or v.lng is None:
        return None
    return haversine_km(ref.lat, ref.lng, v.lat, v.lng)  # type: ignore[arg-type]


def is_nearby(ref: Reference, v: Vendor, dist: float | None) -> bool:
    """Hyperlocal rule: same pincode / locality, or within max(delivery radius, PUBLIC_SEARCH_RADIUS_KM)."""
    if ref.pincode and v.pincode == ref.pincode:
        return True
    if ref.locality_id is not None and v.locality_id == ref.locality_id:
        return True
    if dist is None:
        return False
    return dist <= max(v.delivery_radius_km, get_settings().PUBLIC_SEARCH_RADIUS_KM)


def fssai_registered(v: Vendor, today: date) -> bool:
    f = v.fssai
    return bool(f and f.status == FssaiStatus.registration_issued and (f.expiry_date is None or f.expiry_date >= today))


def _stats(db: Session, vendor_ids: list[int]) -> dict[int, dict]:
    ratings = {
        vid: (avg, n)
        for vid, avg, n in db.execute(
            select(Review.vendor_id, func.avg(Review.rating), func.count(Review.id))
            .where(Review.vendor_id.in_(vendor_ids)).group_by(Review.vendor_id)
        )
    }
    served = dict(db.execute(
        select(Order.vendor_id, func.count(Order.id))
        .where(Order.vendor_id.in_(vendor_ids), Order.status == OrderStatus.completed).group_by(Order.vendor_id)
    ).all())
    out = {}
    for vid in vendor_ids:
        avg, n = ratings.get(vid, (None, 0))
        out[vid] = {"rating_avg": round(float(avg), 1) if avg is not None else None, "rating_count": n,
                    "orders_served": served.get(vid, 0)}
    return out


def _photos(vendors: list[Vendor]) -> dict[int, dict]:
    out = {}
    for v in vendors:
        pub = sorted((m for m in v.media if not m.is_private), key=lambda m: m.id)
        profile = next((m.path for m in reversed(pub) if m.kind == MediaKind.profile), None)
        kitchen = [m.path for m in pub if m.kind == MediaKind.kitchen]
        out[v.id] = {"profile": profile, "kitchen": kitchen}
    return out


def list_vendors(
    db: Session, *, ref: Reference, day: date | None, slot: Slot | None, diet: Diet | None,
    to_you_point: tuple[float, float] | None = None,
) -> list[dict]:
    today = clock.local_today()
    now = clock.now()
    candidates = list(db.scalars(select(Vendor).where(live_vendor_filter(today)).order_by(Vendor.id)))
    scored = []
    for v in candidates:
        d = distance_to(ref, v)
        if is_nearby(ref, v, d):
            scored.append((v, d))
    if not scored:
        return []
    vendor_ids = [v.id for v, _ in scored]

    q = select(MenuOffering).where(MenuOffering.vendor_id.in_(vendor_ids))
    if day is not None:
        q = q.where(MenuOffering.date == day)
    else:
        q = q.where(MenuOffering.date.in_([today, today + timedelta(days=1)]))
    if slot is not None:
        q = q.where(MenuOffering.slot == slot)
    if diet is not None:
        q = q.where(MenuOffering.diet == diet)
    dishes: dict[int, list[MenuOffering]] = defaultdict(list)
    for o in db.scalars(q.order_by(MenuOffering.date, slot_rank(MenuOffering.slot), MenuOffering.id)):
        dishes[o.vendor_id].append(o)

    stats = _stats(db, vendor_ids)
    photos = _photos([v for v, _ in scored])
    localities = {l.id: l.name for l in db.scalars(select(Locality))}
    out = []
    for v, d in scored:
        if diet is not None and not dishes.get(v.id):
            continue  # a diet filter hides cooks with nothing matching
        point = to_you_point or ((ref.lat, ref.lng) if ref.precise else None)
        delivers = bool(
            v.delivery_radius_km > 0 and point and v.lat is not None and v.lng is not None
            and haversine_km(point[0], point[1], v.lat, v.lng) <= v.delivery_radius_km  # type: ignore[arg-type]
        )
        out.append({
            "id": v.id, "display_name": v.display_name, "story": v.story,
            "locality_name": localities.get(v.locality_id) if v.locality_id else None, "pincode": v.pincode,
            "lat": approx(v.lat), "lng": approx(v.lng),
            "distance_km": round(d, 1) if d is not None else None,
            "delivers_to_you": delivers, "offers_pickup": v.offers_pickup, "delivery_radius_km": v.delivery_radius_km,
            "fssai_registered": fssai_registered(v, today),
            "cook_photo": photos[v.id]["profile"],
            "kitchen_photo": photos[v.id]["kitchen"][0] if photos[v.id]["kitchen"] else None,
            **stats[v.id],
            "offerings": [offering_public(o, now) for o in dishes.get(v.id, [])],
        })
    out.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"] or 0, r["id"]))
    return out


def vendor_profile(
    db: Session, v: Vendor, *, day: date | None, slot: Slot | None, point: tuple[float, float] | None
) -> dict:
    today = clock.local_today()
    now = clock.now()
    days = {today + timedelta(days=i) for i in range(PROFILE_MENU_DAYS)}
    if day is not None:
        days.add(day)
    q = select(MenuOffering).where(MenuOffering.vendor_id == v.id, MenuOffering.date.in_(days))
    if slot is not None:
        q = q.where(MenuOffering.slot == slot)
    groups: dict[tuple[date, Slot], list[MenuOffering]] = defaultdict(list)
    for o in db.scalars(q.order_by(MenuOffering.date, slot_rank(MenuOffering.slot), MenuOffering.id)):
        groups[(o.date, o.slot)].append(o)
    menu = [
        {
            "date": d, "slot": s, "cutoff_at": min(o.cutoff_at for o in os_),
            "is_open": any(o.cutoff_at > now and o.portions_sold < o.portions_total for o in os_),
            "dishes": [offering_public(o, now) for o in os_],
        }
        for (d, s), os_ in sorted(groups.items(), key=lambda kv: (kv[0][0], SLOT_ORDER[kv[0][1]]))
    ]

    reviews = db.execute(
        select(Review, User.name).join(User, User.id == Review.customer_id)
        .where(Review.vendor_id == v.id).order_by(Review.created_at.desc(), Review.id.desc()).limit(REVIEWS_ON_PROFILE)
    ).all()
    plans = db.scalars(select(TiffinPlan).where(TiffinPlan.vendor_id == v.id, TiffinPlan.active.is_(True)).order_by(TiffinPlan.id)).all()
    loc = db.get(Locality, v.locality_id) if v.locality_id else None
    photos = _photos([v])[v.id]
    dist = haversine_km(point[0], point[1], v.lat, v.lng) if point and v.lat is not None and v.lng is not None else None
    return {
        "id": v.id, "display_name": v.display_name, "story": v.story,
        "locality_name": loc.name if loc else None, "pincode": v.pincode,
        "lat": approx(v.lat), "lng": approx(v.lng),
        "whatsapp_digits": digits_only(v.whatsapp_phone),
        "offers_pickup": v.offers_pickup, "delivery_radius_km": v.delivery_radius_km,
        "distance_km": round(dist, 1) if dist is not None else None,
        "delivers_to_you": bool(dist is not None and v.delivery_radius_km > 0 and dist <= v.delivery_radius_km),
        "fssai_registered": fssai_registered(v, today),
        "cook_photo": photos["profile"], "kitchen_photos": photos["kitchen"],
        "stats": _stats(db, [v.id])[v.id],
        "menu": menu,
        "plans": [
            {"id": p.id, "name": p.name, "description": p.description, "slot": p.slot, "days_of_week": p.days_of_week,
             "price_per_week": p.price_per_week, "diet": p.diet, "cutoff_hours_before": p.cutoff_hours_before}
            for p in plans
        ],
        "reviews": [
            {"id": r.id, "rating": r.rating, "text": r.text, "created_at": r.created_at,
             "customer_name": (name or "Customer").split()[0]}
            for r, name in reviews
        ],
    }
