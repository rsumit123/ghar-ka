"""Vendor-side order handling: list by date, accept -> ready -> complete, cancel with reason."""
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select

from app.deps import DbDep, require_role
from app.models import MenuOffering, Order, OrderStatus, PaymentMethod, PaymentStatus, Role, User
from app.schemas.order import VendorBulkIn, VendorCancelIn
from app.services import clock, order_views, orders, payments
from app.services.subscriptions import materialize_subscription_orders
from app.services.menu import slot_rank
from app.services.vendors import get_vendor_for_user

# Online orders that haven't been paid yet are invisible to the cook (they may still time out).
_AWAITING_PAYMENT = and_(
    Order.payment_method == PaymentMethod.razorpay, Order.payment_status != PaymentStatus.paid, Order.status == OrderStatus.placed,
)

router = APIRouter(prefix="/vendor/orders", tags=["vendor-orders"])
VendorUser = Annotated[User, Depends(require_role(Role.vendor))]


def _vendor(db, user: User):
    vendor = get_vendor_for_user(db, user.id)
    if vendor is None:
        raise HTTPException(404, "Finish setting up your kitchen first")
    return vendor


def _own_order(db, vendor, order_id: int) -> Order:
    o = db.get(Order, order_id)
    if o is None or o.vendor_id != vendor.id:
        raise HTTPException(404, "Order not found")
    return o


def _run(db, vendor, order_id: int, new: OrderStatus, reason: str | None = None) -> dict:
    order = _own_order(db, vendor, order_id)
    try:
        orders.change_status(db, order, new, clock.now(), reason=reason)
    except orders.OrderError as e:
        raise HTTPException(e.status_code, e.detail) from None
    return order_views.vendor_orders_out(db, [order])[0]


@router.get("")
def list_orders(user: VendorUser, db: DbDep, date: date | None = None):
    """Orders for one day plus per-dish sold counts. Tiffin (subscription) orders are created lazily here."""
    vendor = _vendor(db, user)
    day = date or clock.local_today()
    payments.expire_unpaid_orders(db, clock.now(), vendor_id=vendor.id)
    materialize_subscription_orders(db, max(day, clock.local_today() + timedelta(days=1)), vendor_id=vendor.id)
    rows = db.scalars(
        select(Order).where(Order.vendor_id == vendor.id, Order.date == day, ~_AWAITING_PAYMENT)
        .order_by(slot_rank(Order.slot), Order.created_at, Order.id)
    ).all()
    dishes = db.scalars(
        select(MenuOffering).where(MenuOffering.vendor_id == vendor.id, MenuOffering.date == day)
        .order_by(slot_rank(MenuOffering.slot), MenuOffering.id)
    ).all()
    return {
        "date": day,
        "orders": order_views.vendor_orders_out(db, list(rows)),
        "summary": [
            {"offering_id": o.id, "slot": o.slot, "dish_name": o.dish_name, "sold": o.portions_sold, "total": o.portions_total}
            for o in dishes
        ],
    }


_BULK_TARGET = {"accept": OrderStatus.accepted, "ready": OrderStatus.ready, "complete": OrderStatus.completed}


@router.post("/bulk")
def bulk(body: VendorBulkIn, user: VendorUser, db: DbDep):
    """Move many orders one step (e.g. all tiffins of a meal). Each order is its own transaction:
    change_status commits on success and rolls back on failure, so one bad order never blocks the rest."""
    vendor = _vendor(db, user)
    done: list[dict] = []
    failed: list[dict] = []
    for oid in body.order_ids:
        try:
            done.append(_run(db, vendor, oid, _BULK_TARGET[body.action]))
        except HTTPException as e:
            failed.append({"id": oid, "detail": e.detail})
    return {"done": done, "failed": failed}


@router.post("/{order_id}/accept")
def accept(order_id: int, user: VendorUser, db: DbDep):
    return _run(db, _vendor(db, user), order_id, OrderStatus.accepted)


@router.post("/{order_id}/ready")
def ready(order_id: int, user: VendorUser, db: DbDep):
    return _run(db, _vendor(db, user), order_id, OrderStatus.ready)


@router.post("/{order_id}/complete")
def complete(order_id: int, user: VendorUser, db: DbDep):
    return _run(db, _vendor(db, user), order_id, OrderStatus.completed)


@router.post("/{order_id}/cancel")
def cancel(order_id: int, body: VendorCancelIn, user: VendorUser, db: DbDep):
    return _run(db, _vendor(db, user), order_id, OrderStatus.cancelled, body.reason)
