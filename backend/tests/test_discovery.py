"""Public listing + profile: go-live gating, hyperlocal radius, filters, privacy."""
from datetime import UTC, datetime, timedelta

import pytest

from app.models import Diet, MediaKind, Order, OrderItem, OrderStatus, Review, Role, Slot, TiffinPlan, VendorMedia
from tests.conftest import TODAY

TOMORROW = TODAY + timedelta(days=1)
REF = {"lat": 12.9716, "lng": 77.5946}
V = "/api/v1/vendors"


def ids(r):
    assert r.status_code == 200, r.text
    return [v["id"] for v in r.json()]


def test_needs_an_area(client, clk):
    assert client.get(V).status_code == 422
    assert client.get(V, params={"lat": 12.9}).status_code == 422
    assert client.get(V, params={"pincode": "abc"}).status_code == 422


def test_only_live_vendors_are_listed_and_profiled(client, db, clk, make_vendor, make_offering):
    live = make_vendor(name="Live")
    pending = make_vendor(name="Pending", live=False)
    suspended = make_vendor(name="Susp")
    suspended.review_status = "suspended"
    override = make_vendor(name="Override", live=False, live_override=True)
    db.commit()
    for v in (live, pending, suspended, override):
        make_offering(v)
    assert set(ids(client.get(V, params=REF))) == {live.id, override.id}
    assert client.get(f"{V}/{pending.id}").status_code == 404
    assert client.get(f"{V}/{suspended.id}").status_code == 404
    assert client.get(f"{V}/99999").status_code == 404
    assert client.get(f"{V}/{live.id}").status_code == 200


def test_expired_fssai_drops_out_of_listing(client, db, clk, make_vendor):
    v = make_vendor()
    assert ids(client.get(V, params=REF)) == [v.id]
    clk.set(datetime(2028, 1, 5, tzinfo=UTC))
    assert ids(client.get(V, params=REF)) == []


def test_hyperlocal_radius_and_pincode_rules(client, db, clk, make_vendor):
    lat, lng = REF["lat"], REF["lng"]
    same_pin_far = make_vendor(name="SamePinFar", lat=lat + 0.25, lng=lng, pincode="560001", delivery_radius_km=0)
    near = make_vendor(name="Near", lat=lat + 0.01, lng=lng, pincode="560002", delivery_radius_km=0)
    edge = make_vendor(name="Edge4km", lat=lat + 0.036, lng=lng, pincode="560003", delivery_radius_km=0)
    far_small = make_vendor(name="Far9km", lat=lat + 0.081, lng=lng, pincode="560004", delivery_radius_km=3)
    far_big = make_vendor(name="Far9kmBigRadius", lat=lat + 0.081, lng=lng, pincode="560005", delivery_radius_km=10)
    gone = make_vendor(name="Gone", lat=lat + 0.5, lng=lng, pincode="560006", delivery_radius_km=10)
    nowhere = make_vendor(name="NoCoords", lat=None, lng=None, pincode="560007")

    # lat/lng only (no pincode/locality): purely radius based, max(radius, 5km)
    got = ids(client.get(V, params=REF))
    assert got == [near.id, edge.id, far_big.id]
    assert same_pin_far.id not in got and far_small.id not in got and gone.id not in got and nowhere.id not in got

    # with the pincode: same-pincode vendors always count, even 28 km away; vendors without coords too if pin matches
    got = ids(client.get(V, params={**REF, "pincode": "560001"}))
    assert got == [near.id, edge.id, far_big.id, same_pin_far.id]
    got = ids(client.get(V, params={"pincode": "560007"}))
    assert got == [nowhere.id]
    assert client.get(V, params={"pincode": "560099"}).json() == []


def test_locality_reference_uses_centroid_and_pincode_matching(client, db, clk, make_vendor, make_locality):
    loc = make_locality(pincode="560010", lat=REF["lat"], lng=REF["lng"])
    in_loc = make_vendor(name="InLoc", locality_id=loc.id, pincode="560010", lat=REF["lat"] + 0.3, lng=REF["lng"], delivery_radius_km=0)
    near = make_vendor(name="NearCentroid", pincode="560011", lat=REF["lat"] + 0.02, lng=REF["lng"], delivery_radius_km=0)
    assert ids(client.get(V, params={"locality_id": loc.id})) == [near.id, in_loc.id]
    # a bare pincode that matches a seeded locality resolves to its centroid -> radius search works as well
    assert ids(client.get(V, params={"pincode": "560010"})) == [near.id, in_loc.id]
    # delivers_to_you is only computed from a precise point, not a locality centroid
    assert all(v["delivers_to_you"] is False for v in client.get(V, params={"locality_id": loc.id}).json())


def test_sorted_by_distance_with_card_fields(client, db, clk, make_vendor, make_offering, make_locality):
    lat, lng = REF["lat"], REF["lng"]
    loc = make_locality(name="Indiranagar")
    far = make_vendor(name="Far", lat=lat + 0.03, lng=lng, locality_id=loc.id, delivery_radius_km=2)
    near = make_vendor(name="Near", lat=lat + 0.0123456, lng=lng + 0.0098765, delivery_radius_km=3, offers_pickup=False)
    db.add_all([
        VendorMedia(vendor_id=near.id, kind=MediaKind.profile, path="v1/cook.jpg"),
        VendorMedia(vendor_id=near.id, kind=MediaKind.kitchen, path="v1/k1.jpg"),
        VendorMedia(vendor_id=near.id, kind=MediaKind.kitchen, path="v1/k2.jpg"),
        VendorMedia(vendor_id=near.id, kind=MediaKind.id_proof, path="v1/secret.pdf", is_private=True),
    ])
    cust = Role.customer
    from app.models import User
    c = User(role=cust, phone="+919800000001", name="Priya Sharma")
    db.add(c)
    db.commit()
    for st in (OrderStatus.completed, OrderStatus.completed, OrderStatus.cancelled, OrderStatus.placed):
        db.add(Order(customer_id=c.id, vendor_id=near.id, date=TODAY, slot=Slot.lunch, status=st, fulfilment="pickup", total=100))
    db.flush()
    done = db.query(Order).filter(Order.status == OrderStatus.completed).all()
    db.add_all([Review(order_id=done[0].id, customer_id=c.id, vendor_id=near.id, rating=5, text="great"),
                Review(order_id=done[1].id, customer_id=c.id, vendor_id=near.id, rating=4, text="good")])
    db.commit()
    make_offering(near, name="Dal", total=10)

    r = client.get(V, params={**REF, "slot": "lunch"}).json()
    assert [v["id"] for v in r] == [near.id, far.id]
    n = r[0]
    assert n["distance_km"] == pytest.approx(1.7, abs=0.1) and r[1]["distance_km"] > n["distance_km"]
    assert (n["lat"], n["lng"]) == (12.984, 77.604)  # rounded to 3 decimals
    assert n["delivers_to_you"] is True and r[1]["delivers_to_you"] is False
    assert n["offers_pickup"] is False and n["delivery_radius_km"] == 3
    assert n["rating_avg"] == 4.5 and n["rating_count"] == 2 and n["orders_served"] == 2
    assert n["fssai_registered"] is True
    assert n["cook_photo"] == "v1/cook.jpg" and n["kitchen_photo"] == "v1/k1.jpg"
    assert n["story"] and n["locality_name"] is None and r[1]["locality_name"] == "Indiranagar"
    assert "address_line" not in n and "secret" not in str(r)
    assert r[1]["rating_avg"] is None and r[1]["orders_served"] == 0 and r[1]["cook_photo"] is None
    d = n["offerings"][0]
    assert (d["dish_name"], d["portions_left"], d["is_open"], d["price"]) == ("Dal", 10, True, 8000)
    assert "portions_total" not in d and "portions_sold" not in d


def test_override_vendor_is_not_marked_fssai_registered(client, make_vendor):
    make_vendor(live=False, live_override=True)
    assert client.get(V, params=REF).json()[0]["fssai_registered"] is False


def test_offerings_date_slot_default_window_and_open_state(client, db, clk, make_vendor, make_offering):
    v = make_vendor()
    lunch = make_offering(v, TODAY, Slot.lunch, name="Lunch today", total=3, sold=3)
    dinner = make_offering(v, TODAY, Slot.dinner, name="Dinner today")
    tmr = make_offering(v, TOMORROW, Slot.lunch, name="Lunch tomorrow")
    make_offering(v, TODAY + timedelta(days=3), Slot.lunch, name="Later")

    def names(**p):
        return {(o["dish_name"], o["is_open"], o["portions_left"]) for o in client.get(V, params={**REF, **p}).json()[0]["offerings"]}

    assert names() == {("Lunch today", False, 0), ("Dinner today", True, 10), ("Lunch tomorrow", True, 10)}  # today+tomorrow
    assert names(date=str(TOMORROW)) == {("Lunch tomorrow", True, 10)}
    assert names(date=str(TODAY), slot="dinner") == {("Dinner today", True, 10)}
    assert {n[0] for n in names(date=str(TODAY + timedelta(days=3)))} == {"Later"}
    # past cutoff -> closed even with portions left
    clk.set(tmr.cutoff_at + timedelta(minutes=1))
    got = {o["dish_name"]: o["is_open"] for o in client.get(V, params={**REF, "date": str(TOMORROW)}).json()[0]["offerings"]}
    assert got == {"Lunch tomorrow": False}
    assert dinner.id and lunch.id  # silence unused


def test_diet_filter(client, db, clk, make_vendor, make_offering):
    veg = make_vendor(name="Veg", lat=12.98)
    mixed = make_vendor(name="Mixed", lat=12.99)
    none = make_vendor(name="NoMenu", lat=13.0)
    make_offering(veg, name="Dal", diet=Diet.veg)
    make_offering(mixed, name="Dal2", diet=Diet.veg)
    make_offering(mixed, name="Chicken", diet=Diet.nonveg)
    r = client.get(V, params={**REF, "date": str(TODAY)}).json()
    assert [v["id"] for v in r] == [veg.id, mixed.id, none.id]  # cooks without a menu stay listed
    r = client.get(V, params={**REF, "date": str(TODAY), "diet": "nonveg"}).json()
    assert [v["id"] for v in r] == [mixed.id]
    assert [o["dish_name"] for o in r[0]["offerings"]] == ["Chicken"]
    assert client.get(V, params={**REF, "diet": "egg"}).json() == []
    assert client.get(V, params={**REF, "diet": "bogus"}).status_code == 422


# ---------------------------------------------------------------- profile

def test_profile_contents(client, db, clk, make_vendor, make_offering, make_user):
    v = make_vendor(name="Asha", lat=12.97163, lng=77.59468)
    v.whatsapp_phone = "+919876543210"
    db.add_all([VendorMedia(vendor_id=v.id, kind=MediaKind.profile, path="v/c.jpg"),
                VendorMedia(vendor_id=v.id, kind=MediaKind.kitchen, path="v/k.jpg"),
                VendorMedia(vendor_id=v.id, kind=MediaKind.passport_photo, path="v/p.jpg", is_private=True)])
    db.add(TiffinPlan(vendor_id=v.id, name="Weekly veg", slot=Slot.lunch, days_of_week=[0, 1, 2], price_per_week=90000))
    db.add(TiffinPlan(vendor_id=v.id, name="Old plan", slot=Slot.lunch, days_of_week=[0], price_per_week=1, active=False))
    cust = make_user(Role.customer, name="Meera Iyer")
    for i in range(25):
        o = Order(customer_id=cust.id, vendor_id=v.id, date=TODAY, slot=Slot.lunch, status=OrderStatus.completed, fulfilment="pickup", total=1)
        db.add(o)
        db.flush()
        db.add(Review(order_id=o.id, customer_id=cust.id, vendor_id=v.id, rating=1 + i % 5, text=f"r{i}",
                      created_at=datetime(2026, 10, 1, tzinfo=UTC) + timedelta(hours=i)))
    db.commit()
    make_offering(v, TODAY, Slot.lunch, name="Dal")
    make_offering(v, TODAY, Slot.lunch, name="Roti", price=500)
    make_offering(v, TODAY, Slot.dinner, name="Khichdi")
    make_offering(v, TODAY + timedelta(days=6), Slot.lunch, name="Day7")
    make_offering(v, TODAY + timedelta(days=7), Slot.lunch, name="Day8")  # outside the 7-day window

    p = client.get(f"{V}/{v.id}").json()
    assert p["whatsapp_digits"] == "919876543210"
    assert (p["lat"], p["lng"]) == (12.972, 77.595) and "address_line" not in p
    assert p["cook_photo"] == "v/c.jpg" and p["kitchen_photos"] == ["v/k.jpg"] and "p.jpg" not in str(p)
    assert [(g["date"], g["slot"], [d["dish_name"] for d in g["dishes"]]) for g in p["menu"]] == [
        (str(TODAY), "lunch", ["Dal", "Roti"]), (str(TODAY), "dinner", ["Khichdi"]),
        (str(TODAY + timedelta(days=6)), "lunch", ["Day7"]),
    ]
    g = p["menu"][0]
    assert g["is_open"] is True and g["cutoff_at"] and g["dishes"][0]["is_open"]
    assert [pl["name"] for pl in p["plans"]] == ["Weekly veg"]
    assert len(p["reviews"]) == 20 and p["reviews"][0]["text"] == "r24" and p["reviews"][0]["customer_name"] == "Meera"
    assert p["stats"] == {"rating_avg": 3.0, "rating_count": 25, "orders_served": 25}
    # date/slot narrow (and widen) the menu
    p = client.get(f"{V}/{v.id}", params={"slot": "dinner"}).json()
    assert [g["slot"] for g in p["menu"]] == ["dinner"]
    p = client.get(f"{V}/{v.id}", params={"date": str(TODAY + timedelta(days=7))}).json()
    assert any(g["date"] == str(TODAY + timedelta(days=7)) for g in p["menu"])


def test_profile_distance_and_delivery_for_a_point(client, make_vendor):
    v = make_vendor(delivery_radius_km=1.0)
    near = client.get(f"{V}/{v.id}", params={"lat": 12.975, "lng": 77.5946}).json()
    far = client.get(f"{V}/{v.id}", params={"lat": 13.0, "lng": 77.5946}).json()
    assert near["delivers_to_you"] is True and far["delivers_to_you"] is False and far["distance_km"] > near["distance_km"]
    assert client.get(f"{V}/{v.id}").json()["distance_km"] is None


def test_profile_hides_nothing_about_closed_dishes(client, db, clk, make_vendor, make_offering):
    v = make_vendor()
    make_offering(v, TODAY, name="Gone", total=2, sold=2)
    g = client.get(f"{V}/{v.id}").json()["menu"][0]
    assert g["is_open"] is False and g["dishes"][0]["portions_left"] == 0 and g["dishes"][0]["is_open"] is False
