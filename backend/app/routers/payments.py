"""Razorpay endpoints. All return 404 unless RAZORPAY_ENABLED."""
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from app.deps import DbDep, require_role
from app.models import Order, Role, User
from app.services import clock, order_views, orders, payments

router = APIRouter(prefix="/payments/razorpay", tags=["payments"])
CustomerUser = Annotated[User, Depends(require_role(Role.customer))]


def _flag() -> None:
    if not payments.enabled():
        raise HTTPException(404, "Not found")


class RzpOrderIn(BaseModel):
    order_id: int


class RzpVerifyIn(BaseModel):
    order_id: int
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _own(db, user: User, order_id: int) -> Order:
    o = db.get(Order, order_id)
    if o is None or o.customer_id != user.id:
        raise HTTPException(404, "Order not found")
    return o


@router.post("/order", dependencies=[Depends(_flag)])
def create(body: RzpOrderIn, user: CustomerUser, db: DbDep):
    order = _own(db, user, body.order_id)
    payments.expire_unpaid_orders(db, clock.now(), customer_id=user.id)
    db.refresh(order)
    try:
        return payments.create_razorpay_order(db, order)
    except orders.OrderError as e:
        raise HTTPException(e.status_code, e.detail) from None


@router.post("/verify", dependencies=[Depends(_flag)])
def verify(body: RzpVerifyIn, user: CustomerUser, db: DbDep):
    order = _own(db, user, body.order_id)
    now = clock.now()
    try:
        payments.verify_payment(db, order, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, now)
    except orders.OrderError as e:
        raise HTTPException(e.status_code, e.detail) from None
    return order_views.customer_orders_out(db, [order], now)[0]


@router.post("/webhook", dependencies=[Depends(_flag)])
async def webhook(request: Request, db: DbDep, x_razorpay_signature: Annotated[str | None, Header()] = None):
    body = await request.body()
    if not payments.verify_webhook_signature(body, x_razorpay_signature):
        raise HTTPException(400, "Invalid signature")
    return {"status": payments.handle_webhook(db, body, clock.now())}
