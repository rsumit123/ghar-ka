"""Vendor-side order handling: list by date, accept -> ready -> complete, cancel with reason."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.deps import DbDep, require_role
from app.models import MenuOffering, Order, OrderStatus, Role, User
from app.schemas.order import VendorCancelIn
from app.services import clock, order_views, orders
from app.services.menu import slot_rank
from app.services.vendors import get_vendor_for_user

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
    """Orders for one day plus per-dish sold counts. (Phase 4 hook: materialize subscription orders here.)"""
    vendor = _vendor(db, user)
    day = date or clock.local_today()
    rows = db.scalars(
        select(Order).where(Order.vendor_id == vendor.id, Order.date == day).order_by(slot_rank(Order.slot), Order.created_at, Order.id)
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
