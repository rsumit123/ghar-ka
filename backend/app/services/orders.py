"""Order placement, cancellation and the status state machine.

Capacity is reserved with ONE conditional UPDATE per dish (`portions_sold + q <= portions_total AND cutoff_at > now`),
inside a single transaction with the order insert. Any failure rolls the whole thing back, so a multi-dish order is
all-or-nothing and concurrent buyers can never oversell (the database serialises the UPDATEs).
"""
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (
    Fulfilment, MenuOffering, Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, User, Vendor,
)
from app.config import get_settings
from app.schemas.order import OrderIn
from app.services import clock
from app.services.distance import haversine_km
from app.services.golive import is_vendor_live

# The ONLY place that defines which status moves are legal.
TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.placed: frozenset({OrderStatus.accepted, OrderStatus.cancelled}),
    OrderStatus.accepted: frozenset({OrderStatus.ready, OrderStatus.cancelled}),
    OrderStatus.ready: frozenset({OrderStatus.completed, OrderStatus.cancelled}),
    OrderStatus.completed: frozenset(),
    OrderStatus.cancelled: frozenset(),
}


class OrderError(Exception):
    def __init__(self, detail: str, status_code: int = 409) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def can_transition(old: OrderStatus, new: OrderStatus) -> bool:
    return new in TRANSITIONS[old]


def _fmt_time(dt: datetime) -> str:
    return dt.astimezone(clock.tz()).strftime("%I:%M %p").lstrip("0").lower()


# ---------------------------------------------------------------- fulfilment

def customer_point(customer: User, payload_lat: float | None, payload_lng: float | None) -> tuple[float, float] | None:
    if payload_lat is not None and payload_lng is not None:
        return payload_lat, payload_lng
    if customer.lat is not None and customer.lng is not None:
        return customer.lat, customer.lng
    return None


def check_fulfilment(vendor: Vendor, fulfilment: Fulfilment, point: tuple[float, float] | None, address: str | None) -> None:
    if fulfilment == Fulfilment.pickup:
        if not vendor.offers_pickup:
            raise OrderError("This cook doesn't offer pickup. Choose delivery.", 422)
        return
    if vendor.delivery_radius_km <= 0:
        raise OrderError("This cook doesn't deliver. Choose pickup.", 422)
    if not address:
        raise OrderError("Please add your delivery address", 422)
    if point is None:
        raise OrderError("Please set your delivery location on the map", 422)
    if vendor.lat is None or vendor.lng is None:
        raise OrderError("This cook's delivery area isn't set up yet. Choose pickup.", 422)
    dist = haversine_km(point[0], point[1], vendor.lat, vendor.lng)
    if dist > vendor.delivery_radius_km:
        raise OrderError(
            f"You are {dist:.1f} km away; this cook delivers within {vendor.delivery_radius_km:g} km.", 422
        )


# ---------------------------------------------------------------- placing

def _why_unavailable(o: MenuOffering, qty: int, price: int, now: datetime) -> str:
    if o.price != price:
        return f"The price of {o.dish_name} just changed. Please review your cart."
    if o.cutoff_at <= now:
        return f"Orders for {o.dish_name} closed at {_fmt_time(o.cutoff_at)}."
    left = max(o.portions_total - o.portions_sold, 0)
    if left == 0:
        return f"{o.dish_name} is sold out."
    return f"Only {left} left of {o.dish_name}. Please reduce the quantity."


def place_order(db: Session, customer: User, payload: OrderIn, now: datetime) -> Order:
    """Validate and create an order, reserving portions atomically. Commits on success, rolls back on any error."""
    try:
        return _place_order(db, customer, payload, now)
    except Exception:
        db.rollback()
        raise


def _place_order(db: Session, customer: User, payload: OrderIn, now: datetime) -> Order:
    if payload.payment_method == PaymentMethod.razorpay and not get_settings().RAZORPAY_ENABLED:
        raise OrderError("Online payment isn't available. Please choose cash on delivery.", 422)

    qty_by_id = {i.offering_id: i.qty for i in payload.items}
    offerings = {
        o.id: o for o in db.scalars(select(MenuOffering).where(MenuOffering.id.in_(qty_by_id)))
    }
    if len(offerings) != len(qty_by_id):
        raise OrderError("Some dishes are no longer on the menu. Please refresh.", 404)

    first = next(iter(offerings.values()))
    for o in offerings.values():
        if (o.vendor_id, o.date, o.slot) != (first.vendor_id, first.date, first.slot):
            raise OrderError("One order can include dishes from one cook for one meal (same day and lunch/dinner).", 422)
    if (
        (payload.vendor_id is not None and payload.vendor_id != first.vendor_id)
        or (payload.date is not None and payload.date != first.date)
        or (payload.slot is not None and payload.slot != first.slot)
    ):
        raise OrderError("Your cart doesn't match these dishes. Please refresh.", 422)

    vendor = db.get(Vendor, first.vendor_id)
    if vendor is None or not is_vendor_live(vendor, vendor.fssai, clock.local_today()):
        raise OrderError("This kitchen isn't taking orders right now.", 409)

    # Fail fast with friendly messages before touching rows.
    for oid, qty in qty_by_id.items():
        o = offerings[oid]
        if not (o.cutoff_at > now and o.portions_total - o.portions_sold >= qty):
            raise OrderError(_why_unavailable(o, qty, o.price, now), 409)

    point = customer_point(customer, payload.lat, payload.lng)
    address = payload.delivery_address or (customer.address_line if payload.fulfilment == Fulfilment.delivery else None)
    check_fulfilment(vendor, payload.fulfilment, point, address)

    # Atomic reservation. Sorted ids -> consistent lock order across concurrent orders.
    prices = {oid: o.price for oid, o in offerings.items()}
    names = {oid: o.dish_name for oid, o in offerings.items()}
    total = 0
    items: list[OrderItem] = []
    for oid in sorted(qty_by_id):
        qty, price = qty_by_id[oid], prices[oid]
        res = db.execute(
            update(MenuOffering)
            .where(
                MenuOffering.id == oid,
                MenuOffering.price == price,
                MenuOffering.cutoff_at > now,
                MenuOffering.portions_sold + qty <= MenuOffering.portions_total,
            )
            .values(portions_sold=MenuOffering.portions_sold + qty)
            .execution_options(synchronize_session=False)
        )
        if res.rowcount != 1:
            db.rollback()  # releases every portion reserved so far in this order
            fresh = db.get(MenuOffering, oid)
            assert fresh is not None
            db.refresh(fresh)
            raise OrderError(_why_unavailable(fresh, qty, price, now), 409)
        total += qty * price
        items.append(OrderItem(offering_id=oid, name=names[oid], qty=qty, unit_price=price))

    is_delivery = payload.fulfilment == Fulfilment.delivery
    order = Order(
        customer_id=customer.id, vendor_id=vendor.id, date=first.date, slot=first.slot,
        status=OrderStatus.placed, fulfilment=payload.fulfilment,
        delivery_address=address if is_delivery else None,
        lat=point[0] if (is_delivery and point) else None, lng=point[1] if (is_delivery and point) else None,
        total=total, payment_method=payload.payment_method, payment_status=PaymentStatus.pending,
        note=payload.note, items=items, created_at=now, updated_at=now,
    )
    db.add(order)
    db.commit()
    db.expire_all()  # portions_sold changed via bulk UPDATE; drop stale ORM copies
    return order


# ---------------------------------------------------------------- state machine

def order_cutoff(db: Session, order: Order) -> datetime | None:
    """Earliest cutoff among the dishes in the order (None if the dishes are gone)."""
    ids = [i.offering_id for i in order.items if i.offering_id is not None]
    if not ids:
        return None
    return min(db.scalars(select(MenuOffering.cutoff_at).where(MenuOffering.id.in_(ids))), default=None)


def customer_can_cancel(db: Session, order: Order, now: datetime) -> bool:
    cutoff = order_cutoff(db, order)
    return order.status == OrderStatus.placed and cutoff is not None and cutoff > now


def release_portions(db: Session, order: Order, now: datetime) -> None:
    """Give portions back, but only for dishes whose cutoff hasn't passed (after cutoff the dish is closed anyway)."""
    for item in order.items:
        if item.offering_id is None:
            continue
        db.execute(
            update(MenuOffering)
            .where(
                MenuOffering.id == item.offering_id,
                MenuOffering.cutoff_at > now,
                MenuOffering.portions_sold >= item.qty,
            )
            .values(portions_sold=MenuOffering.portions_sold - item.qty)
            .execution_options(synchronize_session=False)
        )


def change_status(
    db: Session, order: Order, new: OrderStatus, now: datetime, *, reason: str | None = None
) -> Order:
    """Apply a status move through the transition table. Optimistic: the UPDATE only matches the status we read,
    so two concurrent actions (e.g. customer + vendor cancelling) can't both release the portions."""
    old = order.status
    if not can_transition(old, new):
        raise OrderError(f"An order that is {old.value} can't be marked {new.value}.", 409)
    if (new == OrderStatus.accepted and order.payment_method == PaymentMethod.razorpay
            and order.payment_status != PaymentStatus.paid):
        raise OrderError("This order is waiting for the customer's online payment.", 409)
    values: dict = {"status": new, "updated_at": now}
    if new == OrderStatus.cancelled:
        values["cancel_reason"] = reason
    if new == OrderStatus.completed and order.payment_method == PaymentMethod.cod:
        values["payment_status"] = PaymentStatus.paid  # cash collected at hand-over
    try:
        res = db.execute(
            update(Order).where(Order.id == order.id, Order.status == old).values(**values)
            .execution_options(synchronize_session=False)
        )
        if res.rowcount != 1:
            raise OrderError("This order was just updated. Please refresh and try again.", 409)
        if new == OrderStatus.cancelled:
            release_portions(db, order, now)
        db.commit()
        db.expire_all()
    except Exception:
        db.rollback()
        raise
    db.refresh(order)
    return order


def cancel_by_customer(db: Session, order: Order, now: datetime, reason: str | None) -> Order:
    if order.status != OrderStatus.placed:
        raise OrderError(
            "The cook has already accepted this order, so it can't be cancelled here. Please contact the cook."
            if order.status in (OrderStatus.accepted, OrderStatus.ready)
            else f"This order is already {order.status.value}.", 409)
    if not customer_can_cancel(db, order, now):
        raise OrderError("The order-by time has passed, so this order can't be cancelled now. Please contact the cook.", 409)
    return change_status(db, order, OrderStatus.cancelled, now, reason=reason or "Cancelled by customer")


def cancel_by_vendor(db: Session, order: Order, now: datetime, reason: str) -> Order:
    return change_status(db, order, OrderStatus.cancelled, now, reason=reason)
