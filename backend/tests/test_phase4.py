"""Phase 4: tiffin plans, subscriptions, materialisation, reviews, complaints, admin orders/complaints/dashboard."""
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import (
    AuditLog, Complaint, Order, OrderItem, OrderStatus, Role, Slot, Subscription, SubscriptionSkip, TiffinPlan,
)
from app.services import clock, subscriptions as subs
from tests.conftest import TODAY  # Tue 2026-10-20, clk = 08:00 IST

API = "/api/v1"
WED, THU, FRI, SAT = (TODAY + timedelta(days=i) for i in (1, 2, 3, 4))
WEEKDAYS = [0, 1, 2, 3, 4]


@pytest.fixture
def vendor(make_vendor):
    return make_vendor(name="Asha")


@pytest.fixture
def cust(make_user, login_as):
    u = make_user(Role.customer, name="Ravi Kumar", lat=12.9720, lng=77.5950, address_line="5 Park Rd", pincode="560001")
    return u


@pytest.fixture
def plan(db, vendor):
    p = TiffinPlan(vendor_id=vendor.id, name="5 lunches/week", slot=Slot.lunch, days_of_week=WEEKDAYS,
                   price_per_week=50000, cutoff_hours_before=12)
    db.add(p)
    db.commit()
    return p


def subscribe(client, plan, start=WED, weeks=2, **extra):
    body = {"plan_id": plan.id, "start_date": start.isoformat(), "weeks": weeks, "fulfilment": "pickup"} | extra
    return client.post(f"{API}/subscriptions", json=body)


@pytest.fixture
def sub(client, clk, cust, login_as, plan):
    login_as(cust)
    r = subscribe(client, plan)
    assert r.status_code == 201, r.text
    return r.json()


def at(day: date, hh: int = 8, mm: int = 0) -> datetime:
    return clock.at_local(day, datetime(2000, 1, 1, hh, mm).time())


def days(sub_json, state=None):
    return {m["date"]: m["state"] for m in sub_json["upcoming"] if state is None or m["state"] == state}


# ---------------------------------------------------------------- plans

def test_plan_crud_scoped_to_vendor(client, db, vendor, make_vendor, login_as):
    login_as(vendor.user)
    r = client.post(f"{API}/vendor/plans", json={
        "name": "6 dinners", "slot": "dinner", "days_of_week": [5, 0, 0, 1], "price_per_week": 60000, "diet": "veg"})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["days_of_week"] == [0, 1, 5] and p["cutoff_hours_before"] == 12 and p["active"] and p["price_per_meal"] == 20000
    assert client.post(f"{API}/vendor/plans", json={"name": "x", "slot": "lunch", "days_of_week": [7], "price_per_week": 5000}).status_code == 422
    assert client.post(f"{API}/vendor/plans", json={"name": "ok plan", "slot": "lunch", "days_of_week": [], "price_per_week": 5000}).status_code == 422

    u = client.put(f"{API}/vendor/plans/{p['id']}", json={"price_per_week": 70000, "cutoff_hours_before": 6})
    assert u.status_code == 200 and u.json()["price_per_week"] == 70000 and u.json()["cutoff_hours_before"] == 6
    assert client.put(f"{API}/vendor/plans/{p['id']}", json={"name": None}).status_code == 422

    other = make_vendor(name="Other")
    login_as(other.user)
    assert client.put(f"{API}/vendor/plans/{p['id']}", json={"active": False}).status_code == 404
    assert client.get(f"{API}/vendor/plans").json() == []


def test_deactivated_plan_keeps_existing_subscriptions(client, db, clk, vendor, plan, sub, login_as):
    login_as(vendor.user)
    plans = client.get(f"{API}/vendor/plans").json()
    assert plans[0]["subscriber_count"] == 1
    assert client.put(f"{API}/vendor/plans/{plan.id}", json={"active": False}).json()["active"] is False
    assert client.get(f"{API}/vendor/plans").json()[0]["subscriber_count"] == 1
    # public profile hides it; new subscriptions are refused
    assert client.get(f"{API}/vendors/{vendor.id}").json()["plans"] == []
    # existing subscription still active and still materialises
    clk.set(at(THU))
    assert subs.materialize_subscription_orders(db, FRI, vendor_id=vendor.id) == 2
    rows = client.get(f"{API}/vendor/subscribers").json()["subscribers"]
    assert len(rows) == 1 and rows[0]["status"] == "active"


def test_cannot_subscribe_to_inactive_plan(client, db, clk, cust, login_as, plan):
    plan.active = False
    db.commit()
    login_as(cust)
    assert subscribe(client, plan).status_code == 409


# ---------------------------------------------------------------- subscribing

def test_subscribe_validation(client, db, clk, cust, vendor, plan, login_as):
    assert subscribe(client, plan).status_code == 401
    login_as(cust)
    assert subscribe(client, plan, start=TODAY).status_code == 422  # Tue lunch cutoff (00:00 today) has passed
    assert subscribe(client, plan, start=TODAY - timedelta(days=1)).status_code == 422
    assert subscribe(client, plan, weeks=0).status_code == 422
    assert subscribe(client, plan, weeks=9).status_code == 422
    assert subscribe(client, plan, start=TODAY + timedelta(days=200)).status_code == 422
    far = subscribe(client, plan, fulfilment="delivery", delivery_address="Far", lat=13.5, lng=77.5)
    assert far.status_code == 422 and "km away" in far.json()["detail"]
    assert subscribe(client, plan, fulfilment="delivery", delivery_address="Near", lat=12.97, lng=77.595).status_code == 201
    vendor.offers_pickup = False
    db.commit()
    assert subscribe(client, plan).status_code == 422
    vendor.offers_pickup = True
    vendor.live_override = False
    vendor.review_status = vendor.review_status.pending
    db.commit()
    assert subscribe(client, plan).status_code == 409  # kitchen not live


def test_subscribe_happy_path_and_upcoming(client, sub):
    assert sub["status"] == "active" and sub["end_date"] == (WED + timedelta(days=13)).isoformat()
    assert sub["price_per_meal"] == 10000 and sub["plan"]["name"] == "5 lunches/week"
    up = sub["upcoming"]
    assert [m["date"] for m in up][:3] == [WED.isoformat(), THU.isoformat(), FRI.isoformat()]  # no Sat/Sun
    assert all(m["state"] == "open" for m in up) and len(up) == 9  # weekdays Oct 21 .. Nov 2 (14-day window from today)
    assert sub["next_meal_date"] == WED.isoformat()


def test_delivery_subscription_inside_radius(client, cust, login_as, plan, clk):
    login_as(cust)
    r = subscribe(client, plan, fulfilment="delivery", delivery_address="5 Park Rd", lat=12.9720, lng=77.5950)
    assert r.status_code == 201 and r.json()["delivery_address"] == "5 Park Rd"


# ---------------------------------------------------------------- skip / unskip

def test_skip_before_and_after_cutoff(client, db, clk, sub):
    sid = sub["id"]
    r = client.post(f"{API}/subscriptions/{sid}/skip", json={"date": THU.isoformat()})
    assert r.status_code == 200 and days(r.json())[THU.isoformat()] == "skipped"
    assert client.post(f"{API}/subscriptions/{sid}/skip", json={"date": THU.isoformat()}).status_code == 200  # idempotent
    assert db.scalar(select(SubscriptionSkip.id).where(SubscriptionSkip.date == THU)) is not None
    # not a meal day / outside the subscription
    assert client.post(f"{API}/subscriptions/{sid}/skip", json={"date": SAT.isoformat()}).status_code == 422
    assert client.post(f"{API}/subscriptions/{sid}/skip", json={"date": (TODAY).isoformat()}).status_code == 422
    # Wednesday's cutoff is 00:00 Wed (12h before 12:00 lunch)
    clk.set(at(WED, 0, 0) - timedelta(minutes=1))
    assert client.post(f"{API}/subscriptions/{sid}/skip", json={"date": WED.isoformat()}).status_code == 200
    assert client.delete(f"{API}/subscriptions/{sid}/skip/{WED.isoformat()}").status_code == 200
    clk.set(at(WED, 0, 0))
    r = client.post(f"{API}/subscriptions/{sid}/skip", json={"date": WED.isoformat()})
    assert r.status_code == 409
    assert days(client.get(f"{API}/subscriptions").json()[0])[WED.isoformat()] == "locked"
    # skipped Thursday can still be unskipped before its own cutoff, but not after
    assert client.delete(f"{API}/subscriptions/{sid}/skip/{THU.isoformat()}").status_code == 200
    client.post(f"{API}/subscriptions/{sid}/skip", json={"date": THU.isoformat()})
    clk.set(at(THU, 0, 1))
    assert client.delete(f"{API}/subscriptions/{sid}/skip/{THU.isoformat()}").status_code == 409


def test_other_customers_subscription_is_404(client, sub, make_user, login_as):
    login_as(make_user(Role.customer))
    assert client.post(f"{API}/subscriptions/{sub['id']}/skip", json={"date": THU.isoformat()}).status_code == 404
    assert client.post(f"{API}/subscriptions/{sub['id']}/cancel").status_code == 404
    assert client.get(f"{API}/subscriptions").json() == []


# ---------------------------------------------------------------- pause / resume / cancel

def test_pause_until_and_resume(client, db, clk, sub):
    sid = sub["id"]
    r = client.post(f"{API}/subscriptions/{sid}/pause", json={"until": (THU + timedelta(days=1)).isoformat()})
    assert r.status_code == 200 and r.json()["status"] == "paused"
    st = days(r.json())
    assert st[WED.isoformat()] == "paused" and st[THU.isoformat()] == "paused" and st[FRI.isoformat()] == "open"
    assert client.post(f"{API}/subscriptions/{sid}/pause", json={"until": TODAY.isoformat()}).status_code == 422
    r = client.post(f"{API}/subscriptions/{sid}/resume")
    assert r.status_code == 200 and r.json()["status"] == "active" and r.json()["paused_until"] is None
    assert days(r.json())[WED.isoformat()] == "open"
    assert client.post(f"{API}/subscriptions/{sid}/resume").status_code == 409


def test_pause_indefinitely_then_resume_does_not_backfill(client, db, clk, sub, vendor):
    sid = sub["id"]
    assert client.post(f"{API}/subscriptions/{sid}/pause").json()["status"] == "paused"
    clk.set(at(FRI))  # Wed, Thu, Fri cutoffs passed while paused
    assert subs.materialize_subscription_orders(db, FRI + timedelta(days=1)) == 0
    r = client.post(f"{API}/subscriptions/{sid}/resume")
    assert r.json()["status"] == "active"
    assert subs.materialize_subscription_orders(db, FRI + timedelta(days=1)) == 0  # paused meals stay lost
    # next Monday's meal (cutoff Mon 00:00) is not materialised until then, and then it is
    mon = FRI + timedelta(days=3)
    clk.set(at(mon, 1))
    assert subs.materialize_subscription_orders(db, mon) == 1


def test_pause_after_cutoff_keeps_locked_meal_and_cancel(client, db, clk, sub):
    sid = sub["id"]
    clk.set(at(WED, 9))  # Wed's cutoff passed but nothing materialised yet
    client.post(f"{API}/subscriptions/{sid}/pause")
    assert db.scalar(select(Order).where(Order.subscription_id == sid, Order.date == WED)) is not None
    client.post(f"{API}/subscriptions/{sid}/resume")
    r = client.post(f"{API}/subscriptions/{sid}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["upcoming"] == []
    assert client.post(f"{API}/subscriptions/{sid}/cancel").status_code == 409
    assert client.post(f"{API}/subscriptions/{sid}/skip", json={"date": FRI.isoformat()}).status_code == 409
    clk.set(at(FRI))
    assert subs.materialize_subscription_orders(db, FRI) == 0  # cancelled: nothing new


# ---------------------------------------------------------------- materialisation

def test_materialize_idempotent_and_respects_skips(client, db, clk, sub, vendor, login_as):
    sid = sub["id"]
    client.post(f"{API}/subscriptions/{sid}/skip", json={"date": THU.isoformat()})
    assert subs.materialize_subscription_orders(db, FRI) == 0  # still Tuesday: no cutoff passed
    clk.set(at(FRI, 8))  # Wed, Thu, Fri cutoffs have passed
    assert subs.materialize_subscription_orders(db, FRI) == 2  # Wed, Fri (Thu skipped)
    assert subs.materialize_subscription_orders(db, FRI) == 0  # idempotent
    rows = db.scalars(select(Order).where(Order.subscription_id == sid).order_by(Order.date)).all()
    assert [o.date for o in rows] == [WED, FRI]
    o = rows[0]
    assert o.status == OrderStatus.placed and o.total == 10000 and o.payment_method.value == "cod"
    assert o.slot == Slot.lunch and o.vendor_id == vendor.id
    assert db.scalars(select(OrderItem).where(OrderItem.order_id == o.id)).one().offering_id is None

    # vendor list triggers it too, and flags it as tiffin
    clk.set(at(FRI + timedelta(days=3), 8))  # next Monday
    login_as(vendor.user)
    out = client.get(f"{API}/vendor/orders", params={"date": (FRI + timedelta(days=3)).isoformat()}).json()
    assert len(out["orders"]) == 1 and out["orders"][0]["is_tiffin"] is True
    assert out["orders"][0]["items"][0]["name"] == "5 lunches/week"
    assert db.scalar(select(Order).where(Order.subscription_id == sid).order_by(Order.date.desc()).limit(1)).date == FRI + timedelta(days=3)


def test_materialize_race_is_swallowed(client, db, clk, sub, monkeypatch):
    clk.set(at(WED, 9))
    # Simulate another process having created the order after we looked: hide existing orders from the scan.
    assert subs.materialize_subscription_orders(db, WED) == 1
    monkeypatch.setattr(subs, "_orders", lambda db_, ids: {i: {} for i in ids})
    assert subs.materialize_subscription_orders(db, WED) == 0  # IntegrityError caught, no duplicate
    assert len(db.scalars(select(Order).where(Order.subscription_id == sub["id"])).all()) == 1


def test_customer_orders_list_materialises_and_shows_tiffin(client, db, clk, sub):
    clk.set(at(WED, 9))
    orders = client.get(f"{API}/orders").json()
    assert len(orders) == 1 and orders[0]["is_tiffin"] and orders[0]["can_cancel"] is False
    mine = client.get(f"{API}/subscriptions").json()[0]
    assert days(mine)[WED.isoformat()] == "locked" and mine["upcoming"][0]["order_id"] == orders[0]["id"]


def test_cli_materialize(db, clk, sub, monkeypatch):
    from app import cli

    class _Ctx:
        def __enter__(self):
            return db

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(cli, "SessionLocal", lambda: _Ctx())
    clk.set(at(WED, 9))
    assert cli.materialize() == 1
    assert cli.materialize() == 0


# ---------------------------------------------------------------- subscribers

def test_vendor_subscribers_and_counts(client, db, clk, vendor, plan, sub, login_as):
    client.post(f"{API}/subscriptions/{sub['id']}/skip", json={"date": THU.isoformat()})
    clk.set(at(WED, 9))
    login_as(vendor.user)
    data = client.get(f"{API}/vendor/subscribers").json()
    row = data["subscribers"][0]
    assert row["customer"]["name"] == "Ravi Kumar" and row["plan"]["name"] == "5 lunches/week"
    assert row["next_meal_date"] == WED.isoformat() and row["skips_upcoming"] == [THU.isoformat()]
    assert data["plan_counts"] == [{"plan_id": plan.id, "subscribers": 1, "today": 1, "tomorrow": 0}]


# ---------------------------------------------------------------- reviews

def completed_order(db, customer, vendor, day=TODAY, status=OrderStatus.completed) -> Order:
    o = Order(customer_id=customer.id, vendor_id=vendor.id, date=day, slot=Slot.lunch, status=status,
              fulfilment="pickup", total=8000, items=[OrderItem(name="Dal", qty=1, unit_price=8000)])
    db.add(o)
    db.commit()
    return o


def test_review_rules(client, db, clk, cust, vendor, make_user, login_as):
    login_as(cust)
    placed = completed_order(db, cust, vendor, status=OrderStatus.placed)
    done = completed_order(db, cust, vendor)
    assert client.get(f"{API}/orders/{done.id}").json()["can_review"] is True
    assert client.get(f"{API}/orders/{placed.id}").json()["can_review"] is False
    assert client.post(f"{API}/orders/{placed.id}/review", json={"rating": 5}).status_code == 409
    assert client.post(f"{API}/orders/{done.id}/review", json={"rating": 6}).status_code == 422
    assert client.post(f"{API}/orders/{done.id}/review", json={"rating": 4, "text": "x" * 281}).status_code == 422

    login_as(make_user(Role.customer))
    assert client.post(f"{API}/orders/{done.id}/review", json={"rating": 5}).status_code == 404

    login_as(cust)
    r = client.post(f"{API}/orders/{done.id}/review", json={"rating": 4, "text": " Tasty "})
    assert r.status_code == 201
    body = r.json()
    assert body["can_review"] is False and body["review"]["rating"] == 4 and body["review"]["text"] == "Tasty"
    assert client.post(f"{API}/orders/{done.id}/review", json={"rating": 5}).status_code == 409
    assert client.get(f"{API}/orders").json()[0]["review"]["rating"] == 4
    prof = client.get(f"{API}/vendors/{vendor.id}").json()
    assert prof["stats"]["rating_count"] == 1 and prof["stats"]["rating_avg"] == 4.0
    assert prof["reviews"][0]["text"] == "Tasty"


# ---------------------------------------------------------------- complaints

@pytest.fixture
def admin(make_user):
    return make_user(Role.admin)


def test_complaint_flow_and_audit(client, db, clk, cust, vendor, make_user, admin, login_as):
    login_as(cust)
    o = completed_order(db, cust, vendor)
    other_vendor_order_id = o.id
    assert client.post(f"{API}/complaints", json={"vendor_id": vendor.id, "text": "hi"}).status_code == 422  # too short
    assert client.post(f"{API}/complaints", json={"vendor_id": 9999, "text": "Food was cold"}).status_code == 404
    r = client.post(f"{API}/complaints", json={"vendor_id": vendor.id, "order_id": o.id, "text": "Food was cold"})
    assert r.status_code == 201 and r.json()["status"] == "open"
    cid = r.json()["id"]
    client.post(f"{API}/complaints", json={"vendor_id": vendor.id, "text": "General issue with the cook"})
    mine = client.get(f"{API}/complaints").json()
    assert len(mine) == 2 and "admin_note" not in mine[0] and mine[1]["vendor_name"] == "Asha"

    login_as(make_user(Role.customer))
    assert client.post(f"{API}/complaints", json={"vendor_id": vendor.id, "order_id": other_vendor_order_id, "text": "not mine!"}).status_code == 404
    assert client.get(f"{API}/complaints").json() == []
    assert client.get(f"{API}/admin/complaints").status_code == 403

    login_as(admin)
    lst = client.get(f"{API}/admin/complaints", params={"status": "open"}).json()
    assert lst["total"] == 2 and lst["summary"] == {"open": 2, "resolved": 0}
    item = next(i for i in lst["items"] if i["id"] == cid)
    assert item["customer"]["name"] == "Ravi Kumar" and item["vendor"]["name"] == "Asha" and item["order"]["id"] == o.id
    assert client.put(f"{API}/admin/complaints/{cid}", json={"status": "bogus"}).status_code == 422
    r = client.put(f"{API}/admin/complaints/{cid}", json={"status": "resolved", "admin_note": "Spoke to the cook"})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    assert client.get(f"{API}/admin/complaints", params={"status": "open"}).json()["total"] == 1
    assert client.get(f"{API}/admin/complaints", params={"status": "resolved"}).json()["items"][0]["admin_note"] == "Spoke to the cook"
    log = db.scalars(select(AuditLog).where(AuditLog.action == "complaint.update")).one()
    assert log.actor_id == admin.id and log.entity == "complaint" and log.entity_id == cid
    assert log.details["before"]["status"] == "open" and log.details["after"]["status"] == "resolved"
    assert client.put(f"{API}/admin/complaints/999", json={"status": "open"}).status_code == 404


# ---------------------------------------------------------------- admin orders + dashboard

def mk_order(db, customer, vendor, day, status=OrderStatus.completed, sub_id=None, total=8000):
    o = Order(customer_id=customer.id, vendor_id=vendor.id, date=day, slot=Slot.lunch, status=status,
              fulfilment="pickup", total=total, subscription_id=sub_id,
              items=[OrderItem(name="Dal", qty=1, unit_price=total)])
    db.add(o)
    return o


def test_admin_orders_filters(client, db, clk, make_user, make_vendor, vendor, admin, login_as):
    v2 = make_vendor(name="Bina")
    a, b = make_user(Role.customer, name="Anil"), make_user(Role.customer, name="Bhavna")
    mk_order(db, a, vendor, TODAY)
    mk_order(db, a, vendor, TODAY - timedelta(days=3), OrderStatus.cancelled)
    mk_order(db, b, v2, TODAY - timedelta(days=1), OrderStatus.placed)
    mk_order(db, b, v2, TODAY - timedelta(days=10))
    db.commit()
    login_as(admin)
    allr = client.get(f"{API}/admin/orders").json()
    assert allr["total"] == 4 and allr["items"][0]["date"] == TODAY.isoformat()
    assert allr["summary"] == {"placed": 1, "accepted": 0, "ready": 0, "completed": 2, "cancelled": 1}
    first = allr["items"][0]
    assert first["customer"]["name"] == "Anil" and first["vendor"]["name"] == "Asha" and first["items"][0]["name"] == "Dal"
    assert client.get(f"{API}/admin/orders", params={"vendor_id": v2.id}).json()["total"] == 2
    assert client.get(f"{API}/admin/orders", params={"status": "cancelled"}).json()["total"] == 1
    r = client.get(f"{API}/admin/orders", params={"date_from": (TODAY - timedelta(days=3)).isoformat(), "date_to": TODAY.isoformat()}).json()
    assert r["total"] == 3
    r = client.get(f"{API}/admin/orders", params={"vendor_id": v2.id, "status": "completed"}).json()
    assert r["total"] == 1 and r["summary"]["placed"] == 1  # summary ignores the status filter
    page2 = client.get(f"{API}/admin/orders", params={"page": 2, "page_size": 3}).json()
    assert len(page2["items"]) == 1 and page2["total"] == 4
    login_as(a)
    assert client.get(f"{API}/admin/orders").status_code == 403


def test_dashboard_metrics(client, db, clk, make_user, vendor, plan, admin, login_as):
    empty = (login_as(admin), client.get(f"{API}/admin/dashboard").json())[1]
    assert empty["repeat_customer_rate"] is None and empty["orders_today"] == 0 and len(empty["orders_per_day"]) == 14

    c1, c2, c3, c4, c5 = (make_user(Role.customer) for _ in range(5))
    monday = TODAY - timedelta(days=1)  # clk is Tuesday 2026-10-20, week starts Mon 19th
    last_sun = TODAY - timedelta(days=2)
    for _ in range(3):
        mk_order(db, c1, vendor, TODAY)                       # c1: 3 completed
    mk_order(db, c2, vendor, monday)                          # c2: 1 completed
    mk_order(db, c3, vendor, monday)                          # c3: 2 completed + 1 cancelled
    mk_order(db, c3, vendor, last_sun)
    mk_order(db, c3, vendor, TODAY, OrderStatus.cancelled)
    mk_order(db, c4, vendor, TODAY, OrderStatus.placed)       # c4: no completed -> excluded from both counts
    mk_order(db, c5, vendor, last_sun)                        # c5: 1 completed
    sub_row = Subscription(customer_id=c4.id, plan_id=plan.id, vendor_id=vendor.id, start_date=TODAY, weeks=2,
                           fulfilment="pickup")
    ended = Subscription(customer_id=c5.id, plan_id=plan.id, vendor_id=vendor.id, start_date=TODAY - timedelta(days=30),
                         weeks=1, fulfilment="pickup")
    cancelled = Subscription(customer_id=c5.id, plan_id=plan.id, vendor_id=vendor.id, start_date=TODAY, weeks=1,
                             fulfilment="pickup", status="cancelled")
    db.add_all([sub_row, ended, cancelled, Complaint(vendor_id=vendor.id, customer_id=c1.id, text="open one"),
                Complaint(vendor_id=vendor.id, customer_id=c1.id, text="done", status="resolved")])
    db.commit()

    d = client.get(f"{API}/admin/dashboard").json()
    assert d["orders_today"] == 4          # 3 + c4 placed; cancelled excluded
    assert d["orders_this_week"] == 6      # Mon: c2, c3; Tue: 3 + c4  (last Sunday excluded)
    assert d["customers_served"] == 4 and d["repeat_customers"] == 2   # c1, c3 repeat; c1,c2,c3,c5 served
    assert d["repeat_customer_rate"] == 0.5
    assert d["active_subscriptions"] == 1 and d["open_complaints"] == 1
    series = {p["date"]: p["count"] for p in d["orders_per_day"]}
    assert series[TODAY.isoformat()] == 4 and series[monday.isoformat()] == 2 and series[last_sun.isoformat()] == 2
    assert list(series)[0] == (TODAY - timedelta(days=13)).isoformat() and list(series)[-1] == TODAY.isoformat()
    assert "live_vendors" in d and d["live_vendors"] == 1
