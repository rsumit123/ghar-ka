"""Tiffin subscriptions: creation, pause/resume/skip/cancel, upcoming-meal view and order materialisation.

Rules in one place:
- Meal dates = every date in [start_date, start_date + weeks*7 - 1] whose weekday is in plan.days_of_week (Mon=0).
- Meal cutoff = slot start (LUNCH_START / DINNER_START, APP_TIMEZONE) minus plan.cutoff_hours_before. Skips and
  un-skips are allowed strictly before the cutoff.
- Pause: `paused_until` is the first day meals resume (None = indefinitely). A meal is paused if
  status == paused and (paused_until is None or meal date < paused_until).
- Orders are created ("materialised") only once a meal's cutoff has passed, so everything before the cutoff
  stays editable by the customer. State changes (pause, cancel) materialise first so that meals already past
  their cutoff are never lost; resume turns any past-cutoff meal that has no order into a skip so it can't
  reappear retroactively.
- Changing a plan's price / cutoff affects meals not yet materialised. Deactivating a plan only hides it from the
  public profile and blocks new subscriptions; existing subscriptions keep running.
"""
from collections.abc import Iterator
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Fulfilment, Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, Subscription, SubscriptionSkip,
    SubscriptionStatus, TiffinPlan, User, Vendor,
)
from app.schemas.subscription import SubscribeIn
from app.services import clock
from app.services.golive import is_vendor_live
from app.services.orders import OrderError, check_fulfilment, customer_point
from app.services.phone import digits_only

UPCOMING_DAYS = 14
MAX_START_DAYS_AHEAD = 60


# ---------------------------------------------------------------- pure helpers

def end_date(sub: Subscription) -> date:
    return sub.start_date + timedelta(days=sub.weeks * 7 - 1)


def meal_dates(sub: Subscription, plan: TiffinPlan, lo: date | None = None, hi: date | None = None) -> Iterator[date]:
    d = max(sub.start_date, lo) if lo else sub.start_date
    last = min(end_date(sub), hi) if hi else end_date(sub)
    days = set(plan.days_of_week)
    while d <= last:
        if d.weekday() in days:
            yield d
        d += timedelta(days=1)


def is_meal_date(sub: Subscription, plan: TiffinPlan, d: date) -> bool:
    return sub.start_date <= d <= end_date(sub) and d.weekday() in plan.days_of_week


def meal_cutoff(plan: TiffinPlan, d: date) -> datetime:
    return clock.slot_start(d, plan.slot) - timedelta(hours=plan.cutoff_hours_before)


def price_per_meal(plan: TiffinPlan) -> int:
    return plan.price_per_week // max(len(plan.days_of_week), 1)


def is_paused_on(sub: Subscription, d: date) -> bool:
    return sub.status == SubscriptionStatus.paused and (sub.paused_until is None or d < sub.paused_until)


def effective_status(sub: Subscription, today: date) -> str:
    if sub.status == SubscriptionStatus.cancelled:
        return "cancelled"
    if today > end_date(sub):
        return "finished"
    if sub.status == SubscriptionStatus.paused and (sub.paused_until is None or today < sub.paused_until):
        return "paused"
    return "active"


# ---------------------------------------------------------------- data access

def _skips(db: Session, sub_ids: list[int]) -> dict[int, set[date]]:
    out: dict[int, set[date]] = {i: set() for i in sub_ids}
    if sub_ids:
        for sid, d in db.execute(select(SubscriptionSkip.subscription_id, SubscriptionSkip.date)
                                 .where(SubscriptionSkip.subscription_id.in_(sub_ids))):
            out[sid].add(d)
    return out


def _orders(db: Session, sub_ids: list[int]) -> dict[int, dict[date, Order]]:
    out: dict[int, dict[date, Order]] = {i: {} for i in sub_ids}
    if sub_ids:
        for o in db.scalars(select(Order).where(Order.subscription_id.in_(sub_ids))):
            out[o.subscription_id][o.date] = o
    return out


def _plans(db: Session, subs: list[Subscription]) -> dict[int, TiffinPlan]:
    ids = {s.plan_id for s in subs}
    return {p.id: p for p in db.scalars(select(TiffinPlan).where(TiffinPlan.id.in_(ids)))} if ids else {}


# ---------------------------------------------------------------- creating

def create_subscription(db: Session, customer: User, payload: SubscribeIn, now: datetime) -> Subscription:
    plan = db.get(TiffinPlan, payload.plan_id)
    if plan is None:
        raise OrderError("This plan doesn't exist", 404)
    vendor = db.get(Vendor, plan.vendor_id)
    today = clock.local_today()
    if vendor is None or not is_vendor_live(vendor, vendor.fssai, today):
        raise OrderError("This kitchen isn't taking subscriptions right now.", 409)
    if not plan.active:
        raise OrderError("This plan isn't available any more.", 409)
    if payload.start_date < today:
        raise OrderError("The start date can't be in the past.", 422)
    if payload.start_date > today + timedelta(days=MAX_START_DAYS_AHEAD):
        raise OrderError("Please pick a start date within the next two months.", 422)

    first = next(iter(d for d in (payload.start_date + timedelta(days=i) for i in range(7))
                      if d.weekday() in plan.days_of_week), None)
    if first is None:
        raise OrderError("This plan has no meal days.", 422)
    if meal_cutoff(plan, first) <= now:
        raise OrderError("The order-by time for the first meal has passed. Please pick a later start date.", 422)

    point = customer_point(customer, payload.lat, payload.lng)
    address = payload.delivery_address or (customer.address_line if payload.fulfilment == Fulfilment.delivery else None)
    check_fulfilment(vendor, payload.fulfilment, point, address)
    is_delivery = payload.fulfilment == Fulfilment.delivery

    sub = Subscription(
        customer_id=customer.id, plan_id=plan.id, vendor_id=vendor.id, start_date=payload.start_date,
        weeks=payload.weeks, status=SubscriptionStatus.active, fulfilment=payload.fulfilment,
        delivery_address=address if is_delivery else None,
        lat=point[0] if (is_delivery and point) else None, lng=point[1] if (is_delivery and point) else None,
        created_at=now,
    )
    db.add(sub)
    db.commit()
    return sub


# ---------------------------------------------------------------- state changes

class SubscriptionError(OrderError):
    pass


def _require_open(sub: Subscription, today: date) -> None:
    st = effective_status(sub, today)
    if st == "cancelled":
        raise SubscriptionError("This subscription is already cancelled.", 409)
    if st == "finished":
        raise SubscriptionError("This subscription has finished.", 409)


def pause(db: Session, sub: Subscription, until: date | None, now: datetime) -> Subscription:
    today = clock.local_today()
    _require_open(sub, today)
    if until is not None and until <= today:
        raise SubscriptionError("Pick a resume date after today, or pause without a date.", 422)
    if effective_status(sub, today) == "active":
        materialize_subscription_orders(db, today + timedelta(days=1), subscription_id=sub.id)  # lock in past-cutoff meals
    sub.status = SubscriptionStatus.paused
    sub.paused_until = until
    db.commit()
    return sub


def resume(db: Session, sub: Subscription, now: datetime) -> Subscription:
    today = clock.local_today()
    _require_open(sub, today)
    if sub.status != SubscriptionStatus.paused:
        raise SubscriptionError("This subscription isn't paused.", 409)
    materialize_subscription_orders(db, today + timedelta(days=1), subscription_id=sub.id)  # meals outside the pause
    plan = db.get(TiffinPlan, sub.plan_id)
    assert plan is not None
    have = set(_skips(db, [sub.id])[sub.id])
    ordered = set(_orders(db, [sub.id])[sub.id])
    for d in meal_dates(sub, plan, hi=today + timedelta(days=1)):
        if meal_cutoff(plan, d) <= now and d not in have and d not in ordered:
            db.add(SubscriptionSkip(subscription_id=sub.id, date=d))  # was paused: must not reappear
    sub.status = SubscriptionStatus.active
    sub.paused_until = None
    db.commit()
    return sub


def cancel(db: Session, sub: Subscription, now: datetime) -> Subscription:
    today = clock.local_today()
    _require_open(sub, today)
    if effective_status(sub, today) == "active":
        materialize_subscription_orders(db, today + timedelta(days=1), subscription_id=sub.id)
    sub.status = SubscriptionStatus.cancelled
    db.commit()
    return sub


def _check_skippable(db: Session, sub: Subscription, d: date, now: datetime) -> TiffinPlan:
    _require_open(sub, clock.local_today())
    plan = db.get(TiffinPlan, sub.plan_id)
    assert plan is not None
    if not is_meal_date(sub, plan, d):
        raise SubscriptionError("That isn't one of your meal days.", 422)
    if meal_cutoff(plan, d) <= now:
        raise SubscriptionError("It's too late to change this meal; the cook has already started planning it.", 409)
    return plan


def skip(db: Session, sub: Subscription, d: date, now: datetime) -> Subscription:
    _check_skippable(db, sub, d, now)
    db.add(SubscriptionSkip(subscription_id=sub.id, date=d))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # already skipped: idempotent
    return sub


def unskip(db: Session, sub: Subscription, d: date, now: datetime) -> Subscription:
    _check_skippable(db, sub, d, now)
    row = db.scalar(select(SubscriptionSkip).where(SubscriptionSkip.subscription_id == sub.id, SubscriptionSkip.date == d))
    if row is not None:
        db.delete(row)
        db.commit()
    return sub


# ---------------------------------------------------------------- materialising

def materialize_subscription_orders(
    db: Session, until_date: date, vendor_id: int | None = None, *, customer_id: int | None = None,
    subscription_id: int | None = None,
) -> int:
    """Create the Order for every subscription meal on or before `until_date` whose cutoff has passed, unless the
    meal is skipped or paused. Idempotent (unique index on subscription_id + date; races are swallowed).
    Returns how many orders were created."""
    now = clock.now()
    stmt = select(Subscription).where(
        Subscription.status != SubscriptionStatus.cancelled, Subscription.start_date <= until_date
    )
    if vendor_id is not None:
        stmt = stmt.where(Subscription.vendor_id == vendor_id)
    if customer_id is not None:
        stmt = stmt.where(Subscription.customer_id == customer_id)
    if subscription_id is not None:
        stmt = stmt.where(Subscription.id == subscription_id)
    subs = [s for s in db.scalars(stmt) if end_date(s) >= s.start_date]
    if not subs:
        return 0
    ids = [s.id for s in subs]
    plans, skips, existing = _plans(db, subs), _skips(db, ids), _orders(db, ids)

    created = 0
    for sub in subs:
        plan = plans.get(sub.plan_id)
        if plan is None:
            continue
        per_meal = price_per_meal(plan)
        for d in meal_dates(sub, plan, hi=until_date):
            if d in existing[sub.id] or d in skips[sub.id] or is_paused_on(sub, d) or meal_cutoff(plan, d) > now:
                continue
            is_delivery = sub.fulfilment == Fulfilment.delivery
            order = Order(
                customer_id=sub.customer_id, vendor_id=sub.vendor_id, date=d, slot=plan.slot,
                status=OrderStatus.placed, fulfilment=sub.fulfilment,
                delivery_address=sub.delivery_address if is_delivery else None,
                lat=sub.lat if is_delivery else None, lng=sub.lng if is_delivery else None,
                total=per_meal, payment_method=PaymentMethod.cod, payment_status=PaymentStatus.pending,
                subscription_id=sub.id, created_at=now, updated_at=now,
                items=[OrderItem(offering_id=None, name=plan.name, qty=1, unit_price=per_meal)],
            )
            db.add(order)
            try:
                db.commit()
                created += 1
            except IntegrityError:
                db.rollback()  # another request materialised this meal first
    return created


# ---------------------------------------------------------------- views

def _meal_state(sub, plan, d, now, skipped, order, paused) -> dict:
    cutoff = meal_cutoff(plan, d)
    if order is not None:
        state = "locked"
    elif d in skipped:
        state = "skipped"
    elif paused:
        state = "paused"
    elif cutoff <= now:
        state = "locked"
    else:
        state = "open"
    return {"date": d, "state": state, "cutoff_at": cutoff, "order_id": order.id if order else None,
            "order_status": order.status if order else None}


def _next_meal(sub, plan, skipped, today) -> date | None:
    for d in meal_dates(sub, plan, lo=today):
        if d not in skipped and not is_paused_on(sub, d):
            return d
    return None


def customer_subscriptions_out(db: Session, subs: list[Subscription], now: datetime) -> list[dict]:
    if not subs:
        return []
    today = clock.local_today()
    ids = [s.id for s in subs]
    plans, skips, orders = _plans(db, subs), _skips(db, ids), _orders(db, ids)
    vendors = {v.id: v for v in db.scalars(select(Vendor).where(Vendor.id.in_({s.vendor_id for s in subs})))}
    out = []
    for s in subs:
        p, v = plans[s.plan_id], vendors[s.vendor_id]
        status = effective_status(s, today)
        upcoming = [] if status in ("cancelled", "finished") else [
            _meal_state(s, p, d, now, skips[s.id], orders[s.id].get(d), is_paused_on(s, d))
            for d in meal_dates(s, p, lo=today, hi=today + timedelta(days=UPCOMING_DAYS - 1))
        ]
        out.append({
            "id": s.id, "status": status, "start_date": s.start_date, "end_date": end_date(s), "weeks": s.weeks,
            "paused_until": s.paused_until if status == "paused" else None, "fulfilment": s.fulfilment,
            "delivery_address": s.delivery_address, "created_at": s.created_at,
            "price_per_meal": price_per_meal(p), "next_meal_date": None if status in ("cancelled", "finished") else _next_meal(s, p, skips[s.id], today),
            "plan": {"id": p.id, "name": p.name, "slot": p.slot, "days_of_week": p.days_of_week,
                     "price_per_week": p.price_per_week, "diet": p.diet, "active": p.active},
            "vendor": {"id": v.id, "display_name": v.display_name, "whatsapp_digits": digits_only(v.whatsapp_phone)},
            "upcoming": upcoming,
        })
    return out


def plan_out(p: TiffinPlan, subscriber_count: int = 0) -> dict:
    return {
        "id": p.id, "name": p.name, "description": p.description, "slot": p.slot, "days_of_week": p.days_of_week,
        "price_per_week": p.price_per_week, "price_per_meal": price_per_meal(p), "diet": p.diet, "active": p.active,
        "cutoff_hours_before": p.cutoff_hours_before, "subscriber_count": subscriber_count,
    }


def running_subscriptions(db: Session, vendor_id: int) -> list[Subscription]:
    """Subscriptions that are currently active or paused (not cancelled, not past their last week)."""
    today = clock.local_today()
    return [s for s in db.scalars(select(Subscription).where(
        Subscription.vendor_id == vendor_id, Subscription.status != SubscriptionStatus.cancelled
    ).order_by(Subscription.id)) if end_date(s) >= today]


def vendor_subscribers_out(db: Session, vendor_id: int) -> dict:
    today = clock.local_today()
    tomorrow = today + timedelta(days=1)
    subs = running_subscriptions(db, vendor_id)
    ids = [s.id for s in subs]
    plans, skips = _plans(db, subs), _skips(db, ids)
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({s.customer_id for s in subs})))} if subs else {}
    counts: dict[int, dict] = {}
    rows = []
    for s in subs:
        p, c = plans[s.plan_id], users.get(s.customer_id)
        cnt = counts.setdefault(p.id, {"plan_id": p.id, "subscribers": 0, "today": 0, "tomorrow": 0})
        cnt["subscribers"] += 1
        for d, key in ((today, "today"), (tomorrow, "tomorrow")):
            if is_meal_date(s, p, d) and d not in skips[s.id] and not is_paused_on(s, d):
                cnt[key] += 1
        rows.append({
            "id": s.id, "status": effective_status(s, today),
            "customer": {"name": c.name if c else "", "phone": c.phone if c else None,
                         "whatsapp_digits": digits_only(c.phone) if c else ""},
            "plan": {"id": p.id, "name": p.name, "slot": p.slot},
            "fulfilment": s.fulfilment, "delivery_address": s.delivery_address,
            "start_date": s.start_date, "end_date": end_date(s), "paused_until": s.paused_until,
            "next_meal_date": _next_meal(s, p, skips[s.id], today),
            "skips_upcoming": sorted(d for d in skips[s.id] if d >= today),
        })
    return {"subscribers": rows, "plan_counts": list(counts.values())}
