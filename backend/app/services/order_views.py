"""Serialisers for orders (customer and vendor views)."""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Fulfilment, MenuOffering, Order, OrderStatus, Review, User, Vendor
from app.services.phone import digits_only


def _items(o: Order) -> list[dict]:
    return [{"offering_id": i.offering_id, "name": i.name, "qty": i.qty, "unit_price": i.unit_price} for i in o.items]


def _cutoffs(db: Session, orders: list[Order]) -> dict[int, datetime]:
    ids = {i.offering_id for o in orders for i in o.items if i.offering_id is not None}
    if not ids:
        return {}
    rows = db.execute(select(MenuOffering.id, MenuOffering.cutoff_at).where(MenuOffering.id.in_(ids))).all()
    by_offering = dict(rows)
    out: dict[int, datetime] = {}
    for o in orders:
        cs = [by_offering[i.offering_id] for i in o.items if i.offering_id in by_offering]
        if cs:
            out[o.id] = min(cs)
    return out


def _base(o: Order, cutoff: datetime | None) -> dict:
    return {
        "id": o.id, "status": o.status, "date": o.date, "slot": o.slot, "fulfilment": o.fulfilment,
        "delivery_by": o.delivery_by, "delivery_address": o.delivery_address, "lat": o.lat, "lng": o.lng, "note": o.note, "total": o.total,
        "payment_method": o.payment_method, "payment_status": o.payment_status, "cancel_reason": o.cancel_reason,
        "subscription_id": o.subscription_id, "is_tiffin": o.subscription_id is not None,
        "items": _items(o), "cutoff_at": cutoff, "created_at": o.created_at, "updated_at": o.updated_at,
    }


def customer_orders_out(db: Session, orders: list[Order], now: datetime) -> list[dict]:
    cut = _cutoffs(db, orders)
    vendors = {v.id: v for v in db.scalars(select(Vendor).where(Vendor.id.in_({o.vendor_id for o in orders})))} if orders else {}
    reviews = {r.order_id: r for r in db.scalars(select(Review).where(Review.order_id.in_([o.id for o in orders])))} if orders else {}
    result = []
    for o in orders:
        v = vendors[o.vendor_id]
        d = _base(o, cut.get(o.id))
        r = reviews.get(o.id)
        d["review"] = {"rating": r.rating, "text": r.text, "created_at": r.created_at} if r else None
        d["can_review"] = o.status == OrderStatus.completed and r is None
        d["can_cancel"] = o.status == OrderStatus.placed and cut.get(o.id) is not None and cut[o.id] > now
        d["vendor"] = {
            "id": v.id, "display_name": v.display_name, "whatsapp_digits": digits_only(v.whatsapp_phone),
            # The pickup address is only shared once the cook has accepted the order.
            "pickup_address": v.address_line
            if o.fulfilment == Fulfilment.pickup and o.status in (OrderStatus.accepted, OrderStatus.ready, OrderStatus.completed)
            else None,
        }
        result.append(d)
    return result


def vendor_orders_out(db: Session, orders: list[Order]) -> list[dict]:
    cut = _cutoffs(db, orders)
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({o.customer_id for o in orders})))} if orders else {}
    result = []
    for o in orders:
        c = users.get(o.customer_id)
        d = _base(o, cut.get(o.id))
        d["customer"] = {"name": c.name if c else "", "phone": c.phone if c else None,
                         "whatsapp_digits": digits_only(c.phone) if c else ""}
        result.append(d)
    return result


