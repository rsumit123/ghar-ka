"""Vendor tiffin plans and their subscribers.

Deactivating a plan (active=false) hides it from the public profile and blocks new subscriptions; existing
subscriptions are NOT cancelled and keep receiving meals until they end or the customer cancels.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.deps import DbDep, require_role
from app.models import Role, TiffinPlan, User
from app.schemas.subscription import PlanIn, PlanUpdate
from app.services import subscriptions as subs
from app.services.vendors import get_vendor_for_user

router = APIRouter(prefix="/vendor", tags=["vendor-plans"])
VendorUser = Annotated[User, Depends(require_role(Role.vendor))]


def _vendor(db, user: User):
    vendor = get_vendor_for_user(db, user.id)
    if vendor is None:
        raise HTTPException(404, "Finish setting up your kitchen first")
    return vendor


def _counts(db, vendor_id: int) -> dict[int, int]:
    out: dict[int, int] = {}
    for s in subs.running_subscriptions(db, vendor_id):
        out[s.plan_id] = out.get(s.plan_id, 0) + 1
    return out


@router.get("/plans")
def list_plans(user: VendorUser, db: DbDep):
    vendor = _vendor(db, user)
    counts = _counts(db, vendor.id)
    rows = db.scalars(select(TiffinPlan).where(TiffinPlan.vendor_id == vendor.id).order_by(TiffinPlan.id)).all()
    return [subs.plan_out(p, counts.get(p.id, 0)) for p in rows]


@router.post("/plans", status_code=201)
def create_plan(body: PlanIn, user: VendorUser, db: DbDep):
    vendor = _vendor(db, user)
    plan = TiffinPlan(vendor_id=vendor.id, **body.model_dump())
    db.add(plan)
    db.commit()
    return subs.plan_out(plan)


@router.put("/plans/{plan_id}")
def update_plan(plan_id: int, body: PlanUpdate, user: VendorUser, db: DbDep):
    vendor = _vendor(db, user)
    plan = db.get(TiffinPlan, plan_id)
    if plan is None or plan.vendor_id != vendor.id:
        raise HTTPException(404, "Plan not found")
    data = body.model_dump(exclude_unset=True)
    for key in ("name", "slot", "days_of_week", "price_per_week", "diet", "active", "cutoff_hours_before"):
        if key in data and data[key] is None:
            raise HTTPException(422, f"{key} can't be empty")
    if "description" in data:
        data["description"] = data["description"] or None
    for key, val in data.items():
        setattr(plan, key, val)
    db.commit()
    return subs.plan_out(plan, _counts(db, vendor.id).get(plan.id, 0))


@router.get("/subscribers")
def subscribers(user: VendorUser, db: DbDep):
    return subs.vendor_subscribers_out(db, _vendor(db, user).id)
