"""Customer subscriptions (tiffin plans)."""
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.deps import DbDep, require_role
from app.models import Role, Subscription, User
from app.schemas.subscription import PauseIn, SkipIn, SubscribeIn
from app.services import clock
from app.services import subscriptions as subs
from app.services.orders import OrderError

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
CustomerUser = Annotated[User, Depends(require_role(Role.customer))]


def _own(db, user: User, sub_id: int) -> Subscription:
    s = db.get(Subscription, sub_id)
    if s is None or s.customer_id != user.id:
        raise HTTPException(404, "Subscription not found")
    return s


def _out(db, sub: Subscription) -> dict:
    db.refresh(sub)
    return subs.customer_subscriptions_out(db, [sub], clock.now())[0]


def _run(fn, *args):
    try:
        return fn(*args)
    except OrderError as e:
        raise HTTPException(e.status_code, e.detail) from None


@router.post("", status_code=201)
def subscribe(body: SubscribeIn, user: CustomerUser, db: DbDep):
    sub = _run(subs.create_subscription, db, user, body, clock.now())
    return _out(db, sub)


@router.get("")
def my_subscriptions(user: CustomerUser, db: DbDep):
    subs.materialize_subscription_orders(db, clock.local_today() + timedelta(days=1), customer_id=user.id)
    rows = db.scalars(select(Subscription).where(Subscription.customer_id == user.id).order_by(Subscription.id.desc())).all()
    return subs.customer_subscriptions_out(db, list(rows), clock.now())


@router.post("/{sub_id}/pause")
def pause(sub_id: int, user: CustomerUser, db: DbDep, body: PauseIn | None = None):
    sub = _run(subs.pause, db, _own(db, user, sub_id), body.until if body else None, clock.now())
    return _out(db, sub)


@router.post("/{sub_id}/resume")
def resume(sub_id: int, user: CustomerUser, db: DbDep):
    return _out(db, _run(subs.resume, db, _own(db, user, sub_id), clock.now()))


@router.post("/{sub_id}/cancel")
def cancel(sub_id: int, user: CustomerUser, db: DbDep):
    return _out(db, _run(subs.cancel, db, _own(db, user, sub_id), clock.now()))


@router.post("/{sub_id}/skip")
def skip(sub_id: int, body: SkipIn, user: CustomerUser, db: DbDep):
    return _out(db, _run(subs.skip, db, _own(db, user, sub_id), body.date, clock.now()))


@router.delete("/{sub_id}/skip/{day}")
def unskip(sub_id: int, day: date, user: CustomerUser, db: DbDep):
    return _out(db, _run(subs.unskip, db, _own(db, user, sub_id), day, clock.now()))
