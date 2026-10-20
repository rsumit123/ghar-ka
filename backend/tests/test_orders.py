"""Ordering: cutoff, capacity, atomicity, go-live gating, fulfilment, cancellation, state machine."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import MenuOffering, Order, OrderStatus, ReviewStatus, Role, Slot
from app.schemas.order import OrderIn
from app.services import orders as order_service
from tests.conftest import TODAY

TOMORROW = TODAY + timedelta(days=1)


@pytest.fixture
def cust(make_user, login_as):
    u = make_user(Role.customer, name="Ravi", lat=12.9720, lng=77.5950, address_line="5 Park Rd", pincode="560001")
    login_as(u)
    return u


@pytest.fixture
def setup(clk, make_vendor, make_offering, cust):
    vendor = make_vendor()
    dal = make_offering(vendor, name="Dal", total=10)
    roti = make_offering(vendor, name="Roti", total=5, price=500)
    return vendor, dal, roti


def body(*pairs, fulfilment="pickup", **extra):
    return {"items": [{"offering_id": o.id, "qty": q} for o, q in pairs], "fulfilment": fulfilment, **extra}


def sold(db, o):
    db.expire_all()
    return db.get(MenuOffering, o.id).portions_sold


# ---------------------------------------------------------------- basics

def test_place_order_happy_path(client, db, setup):
    vendor, dal, roti = setup
    r = client.post("/api/v1/orders", json=body((dal, 2), (roti, 4), note="less spicy"))
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["status"] == "placed" and o["total"] == 2 * 8000 + 4 * 500
    assert o["note"] == "less spicy" and o["payment_method"] == "cod" and o["can_cancel"] is True
    assert [i["qty"] for i in o["items"]] == [2, 4]
    assert (sold(db, dal), sold(db, roti)) == (2, 4)
    assert client.get("/api/v1/orders").json()[0]["id"] == o["id"]
    assert client.get(f"/api/v1/orders/{o['id']}").json()["vendor"]["pickup_address"] is None  # until accepted


def test_orders_require_customer_login(client, setup, login_as, make_user):
    _, dal, _ = setup
    client.cookies.clear()
    assert client.post("/api/v1/orders", json=body((dal, 1))).status_code == 401
    login_as(make_user(Role.vendor))
    assert client.post("/api/v1/orders", json=body((dal, 1))).status_code == 403


def test_other_customers_order_is_404(client, db, setup, make_user, login_as):
    _, dal, _ = setup
    oid = client.post("/api/v1/orders", json=body((dal, 1))).json()["id"]
    login_as(make_user(Role.customer))
    assert client.get(f"/api/v1/orders/{oid}").status_code == 404
    assert client.post(f"/api/v1/orders/{oid}/cancel").status_code == 404


@pytest.mark.parametrize("qty", [0, 11, -1])
def test_qty_bounds(client, setup, qty):
    _, dal, _ = setup
    assert client.post("/api/v1/orders", json=body((dal, qty))).status_code == 422


def test_ten_per_item_ok_and_duplicates_rejected(client, db, clk, make_vendor, make_offering, cust):
    v = make_vendor()
    big = make_offering(v, total=50)
    assert client.post("/api/v1/orders", json=body((big, 10))).status_code == 201
    r = client.post("/api/v1/orders", json={"items": [{"offering_id": big.id, "qty": 1}] * 2, "fulfilment": "pickup"})
    assert r.status_code == 422


def test_mixed_vendor_date_slot_rejected(client, db, clk, make_vendor, make_offering, cust):
    v1, v2 = make_vendor(name="A"), make_vendor(name="B")
    a = make_offering(v1)
    b = make_offering(v2)
    c = make_offering(v1, day=TOMORROW)
    d = make_offering(v1, slot=Slot.dinner)
    for other in (b, c, d):
        r = client.post("/api/v1/orders", json=body((a, 1), (other, 1)))
        assert r.status_code == 422, r.text
    assert sold(db, a) == 0
    # payload cross-check
    assert client.post("/api/v1/orders", json=body((a, 1), date=str(TOMORROW))).status_code == 422
    assert client.post("/api/v1/orders", json=body((a, 1), vendor_id=v2.id)).status_code == 422
    assert client.post("/api/v1/orders", json=body((a, 1), slot="dinner")).status_code == 422


def test_unknown_offering_404_and_razorpay_not_yet(client, setup):
    _, dal, _ = setup
    assert client.post("/api/v1/orders", json={"items": [{"offering_id": 9999, "qty": 1}], "fulfilment": "pickup"}).status_code == 404
    assert client.post("/api/v1/orders", json=body((dal, 1), payment_method="razorpay")).status_code == 422


# ---------------------------------------------------------------- cutoff

def test_order_one_minute_before_cutoff_succeeds(client, db, clk, setup):
    _, dal, _ = setup  # lunch, 2h preset -> cutoff 10:00 IST = 04:30 UTC
    assert dal.cutoff_at == datetime(2026, 10, 20, 4, 30, tzinfo=UTC)
    clk.set(dal.cutoff_at - timedelta(minutes=1))
    assert client.post("/api/v1/orders", json=body((dal, 1))).status_code == 201


@pytest.mark.parametrize("delta", [timedelta(0), timedelta(seconds=1), timedelta(minutes=30)])
def test_order_at_or_after_cutoff_fails(client, db, clk, setup, delta):
    _, dal, _ = setup
    clk.set(dal.cutoff_at + delta)
    r = client.post("/api/v1/orders", json=body((dal, 1)))
    assert r.status_code == 409 and "closed" in r.json()["detail"]
    assert sold(db, dal) == 0


def test_cutoff_race_inside_update_is_enforced(db, clk, setup, cust):
    """Even if the pre-check passed on stale data, the UPDATE itself refuses past-cutoff reservations."""
    _, dal, _ = setup
    payload = OrderIn(items=[{"offering_id": dal.id, "qty": 1}], fulfilment="pickup")
    with pytest.raises(order_service.OrderError):
        order_service.place_order(db, cust, payload, dal.cutoff_at)  # now == cutoff
    assert sold(db, dal) == 0 and db.scalar(select(Order.id)) is None


def test_cancel_before_cutoff_releases_after_cutoff_fails(client, db, clk, setup):
    _, dal, roti = setup
    oid = client.post("/api/v1/orders", json=body((dal, 3), (roti, 1))).json()["id"]
    clk.set(dal.cutoff_at - timedelta(minutes=1))
    r = client.post(f"/api/v1/orders/{oid}/cancel", json={"reason": "plans changed"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and r.json()["cancel_reason"] == "plans changed"
    assert (sold(db, dal), sold(db, roti)) == (0, 0)
    assert client.post(f"/api/v1/orders/{oid}/cancel").status_code == 409  # already cancelled: no double release
    assert sold(db, dal) == 0


def test_cancel_after_cutoff_fails_and_keeps_portions(client, db, clk, setup):
    _, dal, _ = setup
    oid = client.post("/api/v1/orders", json=body((dal, 3))).json()["id"]
    clk.set(dal.cutoff_at)
    r = client.post(f"/api/v1/orders/{oid}/cancel")
    assert r.status_code == 409 and "order-by time" in r.json()["detail"]
    assert sold(db, dal) == 3
    assert client.get(f"/api/v1/orders/{oid}").json()["can_cancel"] is False


def test_customer_cannot_cancel_after_vendor_accepts(client, db, setup, make_user, login_as, cust):
    vendor, dal, _ = setup
    oid = client.post("/api/v1/orders", json=body((dal, 1))).json()["id"]
    login_as(vendor.user)
    assert client.post(f"/api/v1/vendor/orders/{oid}/accept").status_code == 200
    login_as(cust)
    r = client.post(f"/api/v1/orders/{oid}/cancel")
    assert r.status_code == 409 and "accepted" in r.json()["detail"]
    assert client.get(f"/api/v1/orders/{oid}").json()["vendor"]["pickup_address"] == "12 Tulsi Lane"


# ---------------------------------------------------------------- capacity

def test_exact_sellout_then_oversell_rejected(client, db, clk, make_vendor, make_offering, cust):
    v = make_vendor()
    o = make_offering(v, total=5)
    assert client.post("/api/v1/orders", json=body((o, 3))).status_code == 201
    r = client.post("/api/v1/orders", json=body((o, 3)))
    assert r.status_code == 409 and "Only 2 left" in r.json()["detail"]
    assert sold(db, o) == 3
    assert client.post("/api/v1/orders", json=body((o, 2))).status_code == 201  # exact sell-out
    assert sold(db, o) == 5
    r = client.post("/api/v1/orders", json=body((o, 1)))
    assert r.status_code == 409 and "sold out" in r.json()["detail"]


def test_multi_item_order_is_all_or_nothing(client, db, setup):
    _, dal, roti = setup  # roti has 5
    r = client.post("/api/v1/orders", json=body((dal, 2), (roti, 6)))
    assert r.status_code == 409
    assert (sold(db, dal), sold(db, roti)) == (0, 0)
    assert db.scalar(select(Order.id)) is None


def _set_columns(db, offering_id, **values):
    """Commit a change from a *different* session/connection, like a concurrent request would."""
    from sqlalchemy.orm import Session

    with Session(bind=db.get_bind()) as other:
        other.execute(MenuOffering.__table__.update().where(MenuOffering.id == offering_id).values(**values))
        other.commit()


def _before_first_reservation(db, monkeypatch, action):
    real_execute = db.execute
    state = {"done": False}

    def sneaky(stmt, *a, **kw):
        if "UPDATE menu_offerings" in str(stmt) and not state["done"]:
            state["done"] = True
            action()
        return real_execute(stmt, *a, **kw)

    monkeypatch.setattr(db, "execute", sneaky)


def test_update_level_rollback_when_second_item_lacks_capacity(db, setup, cust, monkeypatch):
    """Pre-checks pass but the 2nd conditional UPDATE fails (stock vanished in between): the 1st reservation rolls back."""
    _, dal, roti = setup
    _before_first_reservation(db, monkeypatch, lambda: _set_columns(db, roti.id, portions_sold=5))
    payload = OrderIn(items=[{"offering_id": dal.id, "qty": 4}, {"offering_id": roti.id, "qty": 2}], fulfilment="pickup")
    with pytest.raises(order_service.OrderError) as e:
        order_service.place_order(db, cust, payload, datetime(2026, 10, 20, 2, 30, tzinfo=UTC))
    assert "sold out" in e.value.detail
    monkeypatch.undo()
    assert sold(db, dal) == 0  # dal's reservation (done before roti failed) was rolled back
    assert db.scalar(select(Order.id)) is None


def test_price_change_between_read_and_reserve_is_refused(db, setup, cust, monkeypatch):
    _, dal, _ = setup

    _before_first_reservation(db, monkeypatch, lambda: _set_columns(db, dal.id, price=9999))
    payload = OrderIn(items=[{"offering_id": dal.id, "qty": 1}], fulfilment="pickup")
    with pytest.raises(order_service.OrderError) as e:
        order_service.place_order(db, cust, payload, datetime(2026, 10, 20, 2, 30, tzinfo=UTC))
    assert "price" in e.value.detail
    monkeypatch.undo()
    assert sold(db, dal) == 0


def test_cancellation_releases_portions_for_reuse(client, db, clk, make_vendor, make_offering, cust):
    v = make_vendor()
    o = make_offering(v, total=2)
    oid = client.post("/api/v1/orders", json=body((o, 2))).json()["id"]
    assert client.post("/api/v1/orders", json=body((o, 1))).status_code == 409
    assert client.post(f"/api/v1/orders/{oid}/cancel").status_code == 200
    assert client.post("/api/v1/orders", json=body((o, 2))).status_code == 201
    assert sold(db, o) == 2


# ---------------------------------------------------------------- go-live gating

def test_non_live_vendor_cannot_take_orders(client, db, clk, make_vendor, make_offering, cust):
    v = make_vendor(live=False)
    o = make_offering(v)
    r = client.post("/api/v1/orders", json=body((o, 1)))
    assert r.status_code == 409 and "isn't taking orders" in r.json()["detail"]
    assert sold(db, o) == 0


def test_suspended_midway_blocks_ordering(client, db, clk, setup):
    vendor, dal, _ = setup
    assert client.post("/api/v1/orders", json=body((dal, 1))).status_code == 201
    vendor.review_status = ReviewStatus.suspended
    db.commit()
    assert client.post("/api/v1/orders", json=body((dal, 1))).status_code == 409
    assert sold(db, dal) == 1


def test_fssai_expiry_blocks_ordering(client, db, clk, setup):
    vendor, dal, _ = setup
    clk.set(datetime(2028, 1, 2, tzinfo=UTC))  # after fssai expiry 2027-12-31
    assert client.post("/api/v1/orders", json=body((dal, 1))).status_code == 409


def test_override_vendor_can_take_orders(client, db, clk, make_vendor, make_offering, cust):
    v = make_vendor(live=False, live_override=True)
    o = make_offering(v)
    assert client.post("/api/v1/orders", json=body((o, 1))).status_code == 201


# ---------------------------------------------------------------- fulfilment

def test_pickup_requires_offers_pickup(client, make_vendor, make_offering, clk, cust):
    v = make_vendor(offers_pickup=False)
    o = make_offering(v)
    r = client.post("/api/v1/orders", json=body((o, 1)))
    assert r.status_code == 422 and "pickup" in r.json()["detail"]


def test_delivery_within_and_outside_radius(client, db, clk, make_vendor, make_offering, cust):
    v = make_vendor(delivery_radius_km=2.0)  # vendor at 12.9716, 77.5946
    o = make_offering(v, total=50)
    near = body((o, 1), fulfilment="delivery", delivery_address="5 Park Rd", lat=12.9800, lng=77.5946)  # ~0.93 km
    r = client.post("/api/v1/orders", json=near)
    assert r.status_code == 201 and r.json()["delivery_address"] == "5 Park Rd" and r.json()["lat"] == 12.98
    far = body((o, 1), fulfilment="delivery", delivery_address="Far St", lat=12.9716, lng=77.6300)  # ~3.9 km
    r = client.post("/api/v1/orders", json=far)
    assert r.status_code == 422 and "within 2 km" in r.json()["detail"]
    assert sold(db, o) == 1


def test_delivery_radius_boundary_uses_haversine(db, clk, make_vendor, make_offering, cust):
    from app.services.distance import haversine_km

    v = make_vendor(delivery_radius_km=1.0)
    lat = 12.9716 + 0.0089  # ~0.99 km north
    d = haversine_km(lat, v.lng, v.lat, v.lng)
    assert 0.95 < d < 1.0
    order_service.check_fulfilment(v, order_service.Fulfilment.delivery, (lat, v.lng), "addr")
    with pytest.raises(order_service.OrderError):
        order_service.check_fulfilment(v, order_service.Fulfilment.delivery, (lat + 0.002, v.lng), "addr")


def test_delivery_uses_profile_location_when_payload_has_none(client, make_vendor, make_offering, clk, cust):
    v = make_vendor(delivery_radius_km=2.0)
    o = make_offering(v, total=50)
    r = client.post("/api/v1/orders", json=body((o, 1), fulfilment="delivery"))  # address + point from profile
    assert r.status_code == 201 and r.json()["delivery_address"] == "5 Park Rd"


@pytest.mark.parametrize("radius,extra,msg", [
    (0.0, {"delivery_address": "x"}, "doesn't deliver"),
    (3.0, {}, None),  # address from profile -> fine; handled below
])
def test_delivery_rejections(client, db, clk, make_vendor, make_offering, make_user, login_as, radius, extra, msg):
    v = make_vendor(delivery_radius_km=radius)
    o = make_offering(v)
    nolocation = make_user(Role.customer)  # no address / location in profile
    login_as(nolocation)
    r = client.post("/api/v1/orders", json=body((o, 1), fulfilment="delivery", **extra))
    assert r.status_code == 422
    if msg:
        assert msg in r.json()["detail"]
    else:
        assert "address" in r.json()["detail"]
    r = client.post("/api/v1/orders", json=body((o, 1), fulfilment="delivery", delivery_address="x"))
    assert r.status_code == 422  # still no location (or no delivery)


# ---------------------------------------------------------------- state machine

def test_transition_table_is_exactly_the_spec():
    S = OrderStatus
    legal = {(a, b) for a, bs in order_service.TRANSITIONS.items() for b in bs}
    assert legal == {(S.placed, S.accepted), (S.accepted, S.ready), (S.ready, S.completed),
                     (S.placed, S.cancelled), (S.accepted, S.cancelled), (S.ready, S.cancelled)}


def _place(client, dal):
    return client.post("/api/v1/orders", json=body((dal, 2))).json()["id"]


def test_vendor_happy_path_and_payment_marked_paid(client, db, setup, login_as, cust):
    vendor, dal, _ = setup
    oid = _place(client, dal)
    login_as(vendor.user)
    for step, status in [("accept", "accepted"), ("ready", "ready"), ("complete", "completed")]:
        r = client.post(f"/api/v1/vendor/orders/{oid}/{step}")
        assert r.status_code == 200 and r.json()["status"] == status
    assert r.json()["payment_status"] == "paid"
    assert r.json()["customer"]["phone"] == cust.phone


@pytest.mark.parametrize("path", [["ready"], ["complete"], ["accept", "accept"], ["accept", "complete"], ["accept", "ready", "accept"]])
def test_illegal_transitions_rejected(client, db, setup, login_as, path):
    vendor, dal, _ = setup
    oid = _place(client, dal)
    login_as(vendor.user)
    for step in path[:-1]:
        assert client.post(f"/api/v1/vendor/orders/{oid}/{step}").status_code == 200
    r = client.post(f"/api/v1/vendor/orders/{oid}/{path[-1]}")
    assert r.status_code == 409


@pytest.mark.parametrize("final", ["completed", "cancelled"])
def test_terminal_orders_cannot_move(client, db, setup, login_as, final):
    vendor, dal, _ = setup
    oid = _place(client, dal)
    login_as(vendor.user)
    if final == "cancelled":
        client.post(f"/api/v1/vendor/orders/{oid}/cancel", json={"reason": "gas ran out"})
    else:
        for s in ("accept", "ready", "complete"):
            client.post(f"/api/v1/vendor/orders/{oid}/{s}")
    for action, payload in [("accept", {}), ("ready", {}), ("complete", {}), ("cancel", {"reason": "again"})]:
        assert client.post(f"/api/v1/vendor/orders/{oid}/{action}", json=payload).status_code == 409


def test_vendor_cancel_needs_reason_and_releases_before_cutoff(client, db, clk, setup, login_as):
    vendor, dal, roti = setup
    oid = client.post("/api/v1/orders", json=body((dal, 3), (roti, 2))).json()["id"]
    login_as(vendor.user)
    assert client.post(f"/api/v1/vendor/orders/{oid}/cancel", json={}).status_code == 422
    assert client.post(f"/api/v1/vendor/orders/{oid}/cancel", json={"reason": "  "}).status_code == 422
    client.post(f"/api/v1/vendor/orders/{oid}/accept")
    r = client.post(f"/api/v1/vendor/orders/{oid}/cancel", json={"reason": "Out of gas"})
    assert r.json()["status"] == "cancelled" and r.json()["cancel_reason"] == "Out of gas"
    assert (sold(db, dal), sold(db, roti)) == (0, 0)


def test_vendor_cancel_after_cutoff_does_not_release(client, db, clk, setup, login_as):
    vendor, dal, _ = setup
    oid = client.post("/api/v1/orders", json=body((dal, 3))).json()["id"]
    clk.set(dal.cutoff_at + timedelta(minutes=5))
    login_as(vendor.user)
    r = client.post(f"/api/v1/vendor/orders/{oid}/cancel", json={"reason": "Sorry"})
    assert r.status_code == 200 and sold(db, dal) == 3


def test_vendor_can_only_touch_own_orders(client, db, setup, make_vendor, login_as):
    vendor, dal, _ = setup
    oid = _place(client, dal)
    other = make_vendor(name="Other", lat=13.0, lng=77.6)
    login_as(other.user)
    assert client.post(f"/api/v1/vendor/orders/{oid}/accept").status_code == 404
    assert client.get("/api/v1/vendor/orders").json()["orders"] == []


def test_vendor_orders_list_and_summary(client, db, clk, setup, login_as):
    vendor, dal, roti = setup
    _place(client, dal)
    client.post("/api/v1/orders", json=body((dal, 1), (roti, 3), fulfilment="delivery", delivery_address="9 Rd", lat=12.98, lng=77.5946))
    login_as(vendor.user)
    data = client.get("/api/v1/vendor/orders", params={"date": str(TODAY)}).json()
    assert len(data["orders"]) == 2
    o = data["orders"][1]
    assert o["customer"]["name"] == "Ravi" and o["fulfilment"] == "delivery" and o["delivery_address"] == "9 Rd"
    assert {s["dish_name"]: (s["sold"], s["total"]) for s in data["summary"]} == {"Dal": (3, 10), "Roti": (3, 5)}
    assert client.get("/api/v1/vendor/orders", params={"date": str(TOMORROW)}).json()["orders"] == []


def test_concurrent_conflicting_cancels_release_once(db, clk, setup, cust):
    """Customer + vendor cancel the same order: the optimistic status UPDATE lets only one win."""
    vendor, dal, _ = setup
    payload = OrderIn(items=[{"offering_id": dal.id, "qty": 4}], fulfilment="pickup")
    order = order_service.place_order(db, cust, payload, clk.current)
    stale = db.get(Order, order.id)
    order_service.change_status(db, order, OrderStatus.cancelled, clk.current, reason="a")
    stale.status = OrderStatus.placed  # simulate a stale in-memory copy that still thinks it's placed
    with pytest.raises(order_service.OrderError):
        order_service.change_status(db, stale, OrderStatus.cancelled, clk.current, reason="b")
    assert sold(db, dal) == 0


# ---------------------------------------------------------------- customer profile

def test_put_me_updates_profile(client, cust):
    r = client.put("/api/v1/me", json={"name": "Ravi K", "address_line": "7 Lake View", "pincode": "560002", "lat": 12.9, "lng": 77.5})
    assert r.status_code == 200
    me = client.get("/api/v1/auth/me").json()
    assert (me["name"], me["address_line"], me["pincode"], me["lat"]) == ("Ravi K", "7 Lake View", "560002", 12.9)
    assert client.put("/api/v1/me", json={"lat": 12.9}).status_code == 422
    assert client.put("/api/v1/me", json={"pincode": "abc"}).status_code == 422
    assert client.put("/api/v1/auth/me", json={"name": "Ravi Z"}).json()["name"] == "Ravi Z"
