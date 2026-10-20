"""Customer feedback: reviews on completed orders and complaints."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import DbDep, require_role
from app.models import Complaint, Order, OrderStatus, Review, Role, User, Vendor
from app.schemas.subscription import ComplaintIn, ReviewIn
from app.services import clock, order_views

router = APIRouter(tags=["feedback"])
CustomerUser = Annotated[User, Depends(require_role(Role.customer))]


@router.post("/orders/{order_id}/review", status_code=201)
def review_order(order_id: int, body: ReviewIn, user: CustomerUser, db: DbDep):
    order = db.get(Order, order_id)
    if order is None or order.customer_id != user.id:
        raise HTTPException(404, "Order not found")
    if order.status != OrderStatus.completed:
        raise HTTPException(409, "You can review an order once it's completed.")
    if db.scalar(select(Review.id).where(Review.order_id == order.id)) is not None:
        raise HTTPException(409, "You've already reviewed this order.")
    db.add(Review(order_id=order.id, customer_id=user.id, vendor_id=order.vendor_id, rating=body.rating,
                  text=body.text, created_at=clock.now()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You've already reviewed this order.") from None
    return order_views.customer_orders_out(db, [order], clock.now())[0]


def _complaint_out(c: Complaint, vendor_name: str | None) -> dict:
    # admin_note is internal and deliberately not shown to customers.
    return {"id": c.id, "order_id": c.order_id, "vendor_id": c.vendor_id, "vendor_name": vendor_name,
            "text": c.text, "status": c.status, "created_at": c.created_at}


@router.post("/complaints", status_code=201)
def create_complaint(body: ComplaintIn, user: CustomerUser, db: DbDep):
    vendor = db.get(Vendor, body.vendor_id)
    if vendor is None:
        raise HTTPException(404, "Cook not found")
    if body.order_id is not None:
        order = db.get(Order, body.order_id)
        if order is None or order.customer_id != user.id:
            raise HTTPException(404, "Order not found")
        if order.vendor_id != vendor.id:
            raise HTTPException(422, "That order belongs to a different cook")
    c = Complaint(order_id=body.order_id, vendor_id=vendor.id, customer_id=user.id, text=body.text, created_at=clock.now())
    db.add(c)
    db.commit()
    return _complaint_out(c, vendor.display_name)


@router.get("/complaints")
def my_complaints(user: CustomerUser, db: DbDep):
    rows = db.execute(
        select(Complaint, Vendor.display_name).join(Vendor, Vendor.id == Complaint.vendor_id)
        .where(Complaint.customer_id == user.id).order_by(Complaint.id.desc()).limit(100)
    ).all()
    return [_complaint_out(c, name) for c, name in rows]
