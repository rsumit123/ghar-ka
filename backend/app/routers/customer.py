"""Customer API: profile update and orders."""
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.deps import DbDep, require_role
from app.models import Order, Role, User
from app.schemas.auth import UserOut
from app.schemas.order import CancelIn, OrderIn, ProfileUpdateIn
from app.services import clock, order_views, orders, payments
from app.services.subscriptions import materialize_subscription_orders

router = APIRouter(tags=["customer"])
CustomerUser = Annotated[User, Depends(require_role(Role.customer))]


@router.put("/me", response_model=UserOut)
@router.put("/auth/me", response_model=UserOut, include_in_schema=False)
def update_me(body: ProfileUpdateIn, user: CustomerUser, db: DbDep):
    data = body.model_dump(exclude_unset=True)
    if ("lat" in data or "lng" in data) and (data.get("lat") is None) != (data.get("lng") is None):
        raise HTTPException(422, "Send both lat and lng")
    for key, val in data.items():
        if key == "name" and not val:
            continue
        setattr(user, key, val)
    db.commit()
    return user


def _own(db, user: User, order_id: int) -> Order:
    o = db.get(Order, order_id)
    if o is None or o.customer_id != user.id:
        raise HTTPException(404, "Order not found")
    return o


@router.post("/orders", status_code=201)
def create_order(body: OrderIn, user: CustomerUser, db: DbDep):
    now = clock.now()
    try:
        order = orders.place_order(db, user, body, now)
    except orders.OrderError as e:
        raise HTTPException(e.status_code, e.detail) from None
    return order_views.customer_orders_out(db, [order], now)[0]


@router.get("/orders")
def my_orders(user: CustomerUser, db: DbDep):
    payments.expire_unpaid_orders(db, clock.now(), customer_id=user.id)
    materialize_subscription_orders(db, clock.local_today() + timedelta(days=1), customer_id=user.id)
    rows = db.scalars(select(Order).where(Order.customer_id == user.id).order_by(Order.created_at.desc(), Order.id.desc()).limit(100)).all()
    return order_views.customer_orders_out(db, list(rows), clock.now())


@router.get("/orders/{order_id}")
def get_order(order_id: int, user: CustomerUser, db: DbDep):
    payments.expire_unpaid_orders(db, clock.now(), customer_id=user.id)
    return order_views.customer_orders_out(db, [_own(db, user, order_id)], clock.now())[0]


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, user: CustomerUser, db: DbDep, body: CancelIn | None = None):
    order = _own(db, user, order_id)
    now = clock.now()
    try:
        orders.cancel_by_customer(db, order, now, body.reason if body else None)
    except orders.OrderError as e:
        raise HTTPException(e.status_code, e.detail) from None
    return order_views.customer_orders_out(db, [order], now)[0]
