"""Who delivers: the cook sets "I'll bring it" or "delivery partner"; each delivery order keeps a snapshot."""
from app.models import DeliveryBy, Role
from tests.test_orders import body, cust  # noqa: F401  (fixture)


def test_cook_sets_delivery_by(client, make_vendor, login_as):
    v = make_vendor()
    login_as(v.user)
    url = "/api/v1/vendor/fulfilment"
    assert client.get("/api/v1/vendor/me").json()["delivery_by"] == "self"
    r = client.put(url, json={"offers_pickup": False, "delivery_radius_km": 3, "delivery_by": "partner"})
    assert r.status_code == 200 and r.json()["delivery_by"] == "partner" and r.json()["offers_pickup"] is False
    # older clients that don't send it keep working (default: the cook delivers)
    assert client.put(url, json={"offers_pickup": True, "delivery_radius_km": 2}).json()["delivery_by"] == "self"
    # at least one way to hand over food
    assert client.put(url, json={"offers_pickup": False, "delivery_radius_km": 0}).status_code == 422
    assert client.put(url, json={"offers_pickup": True, "delivery_radius_km": 0, "delivery_by": "drone"}).status_code == 422


def test_order_snapshots_delivery_by(client, db, clk, make_vendor, make_offering, cust):  # noqa: F811
    v = make_vendor(delivery_radius_km=2.0, delivery_by=DeliveryBy.partner)
    o = make_offering(v, total=10)
    r = client.post("/api/v1/orders", json=body((o, 1), fulfilment="delivery"))
    assert r.status_code == 201 and r.json()["delivery_by"] == "partner"
    pickup = client.post("/api/v1/orders", json=body((o, 1)))
    assert pickup.status_code == 201 and pickup.json()["delivery_by"] is None

    # the cook changing their setting later doesn't rewrite past orders
    v.delivery_by = DeliveryBy.self
    db.commit()
    mine = {x["id"]: x for x in client.get("/api/v1/orders").json()}
    assert mine[r.json()["id"]]["delivery_by"] == "partner"

    # public profile shows who delivers
    assert client.get(f"/api/v1/vendors/{v.id}").json()["delivery_by"] == "self"


def test_pickup_only_cook_blocks_delivery(client, clk, make_vendor, make_offering, cust):  # noqa: F811
    v = make_vendor(delivery_radius_km=0)
    o = make_offering(v, total=10)
    r = client.post("/api/v1/orders", json=body((o, 1), fulfilment="delivery", delivery_address="x", lat=12.972, lng=77.595))
    assert r.status_code == 422 and "doesn't deliver" in r.json()["detail"]
    d = make_vendor(name="Bina", offers_pickup=False)
    o2 = make_offering(d, total=10)
    r = client.post("/api/v1/orders", json=body((o2, 1)))
    assert r.status_code == 422 and "doesn't offer pickup" in r.json()["detail"]

