"""Vendor offerings API."""
import io
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image

from app.models import MenuOffering, Role, Slot
from tests.conftest import TODAY

TOMORROW = TODAY + timedelta(days=1)
H = {"X-Requested-With": "gharka"}


@pytest.fixture
def vend(clk, make_vendor, login_as):
    v = make_vendor(live=False)  # non-live vendors may prepare menus
    login_as(v.user)
    return v


def dish(**kw):
    return {"dish_name": "Rajma Chawal", "slot": "lunch", "dates": [str(TOMORROW)], "price": 9000, "portions_total": 12, **kw}


def jpeg():
    b = io.BytesIO()
    Image.new("RGB", (40, 30), "orange").save(b, "JPEG")
    return b.getvalue()


def test_create_for_multiple_dates_computes_cutoff_per_date(client, vend):
    days = [TODAY + timedelta(days=i) for i in (1, 2, 3)]
    r = client.post("/api/v1/vendor/offerings", json=dish(dates=[str(d) for d in days], cutoff_preset="night_before_9pm"))
    assert r.status_code == 201, r.text
    out = r.json()
    assert [o["date"] for o in out] == [str(d) for d in days]
    for o, d in zip(out, days, strict=True):
        local = datetime.fromisoformat(o["cutoff_at"]).astimezone(__import__("app.services.clock", fromlist=["tz"]).tz())
        assert (local.date(), local.hour) == (d - timedelta(days=1), 21)
        assert o["portions_left"] == 12 and o["is_open"] and o["portions_sold"] == 0


def test_default_cutoff_is_two_hours_before_and_explicit_time(client, vend):
    o = client.post("/api/v1/vendor/offerings", json=dish()).json()[0]
    assert datetime.fromisoformat(o["cutoff_at"]) == datetime(2026, 10, 21, 4, 30, tzinfo=UTC)  # 10:00 IST
    o = client.post("/api/v1/vendor/offerings", json=dish(slot="dinner", cutoff_time="16:15")).json()[0]
    assert datetime.fromisoformat(o["cutoff_at"]) == datetime(2026, 10, 21, 10, 45, tzinfo=UTC)


@pytest.mark.parametrize("patch,code", [
    ({"dates": [str(TODAY - timedelta(days=1))]}, 422),  # past
    ({"dates": [str(TODAY)], "cutoff_preset": "2h"}, 201),  # today lunch: 10:00 still ahead of 08:00
    ({"dates": [str(TODAY)], "cutoff_preset": "night_before_9pm"}, 422),  # already passed
    ({"cutoff_time": "13:00"}, 422),  # after slot start
    ({"cutoff_preset": "nope"}, 422),
    ({"price": 0}, 422),
    ({"portions_total": 0}, 422),
    ({"dates": [str(TODAY + timedelta(days=90))]}, 422),
    ({"dates": []}, 422),
])
def test_create_validation(client, vend, patch, code):
    assert client.post("/api/v1/vendor/offerings", json=dish(**patch)).status_code == code


def test_create_is_all_or_nothing(client, db, vend):
    r = client.post("/api/v1/vendor/offerings", json=dish(dates=[str(TOMORROW), str(TODAY - timedelta(days=2))]))
    assert r.status_code == 422
    assert db.query(MenuOffering).count() == 0


def test_requires_onboarded_vendor_and_role(client, make_user, login_as):
    login_as(make_user(Role.vendor))
    assert client.get("/api/v1/vendor/offerings").status_code == 404
    assert client.post("/api/v1/vendor/offerings", json=dish()).status_code == 404
    login_as(make_user(Role.customer))
    assert client.get("/api/v1/vendor/offerings").status_code == 403


def test_list_range_and_isolation(client, db, vend, make_vendor, make_offering):
    make_offering(vend, TODAY, Slot.lunch, name="A")
    make_offering(vend, TOMORROW, Slot.dinner, name="B")
    make_offering(vend, TODAY + timedelta(days=9), Slot.lunch, name="Far")
    make_offering(make_vendor(name="Other"), TODAY, name="NotMine")
    names = [o["dish_name"] for o in client.get("/api/v1/vendor/offerings").json()]
    assert names == ["A", "B"]  # default window = 7 days from today
    r = client.get("/api/v1/vendor/offerings", params={"date_from": str(TODAY), "date_to": str(TODAY + timedelta(days=10))})
    assert [o["dish_name"] for o in r.json()] == ["A", "B", "Far"]
    assert client.get("/api/v1/vendor/offerings", params={"date_from": str(TODAY), "date_to": str(TODAY - timedelta(days=1))}).status_code == 422


def test_update_basic_fields_and_cutoff(client, vend, make_offering):
    o = make_offering(vend, TOMORROW)
    r = client.put(f"/api/v1/vendor/offerings/{o.id}", json={"price": 11000, "dish_name": "Paneer", "diet": "egg",
                                                           "cutoff_preset": "1h", "portions_total": 20})
    assert r.status_code == 200
    j = r.json()
    assert (j["price"], j["dish_name"], j["diet"], j["portions_total"], j["portions_left"]) == (11000, "Paneer", "egg", 20, 20)
    assert datetime.fromisoformat(j["cutoff_at"]) == datetime(2026, 10, 21, 5, 30, tzinfo=UTC)  # 11:00 IST
    assert client.put(f"/api/v1/vendor/offerings/{o.id}", json={"date": str(TODAY)}).status_code == 422


def test_cannot_reduce_portions_below_sold(client, db, vend, make_offering):
    o = make_offering(vend, TOMORROW, total=10, sold=6)
    r = client.put(f"/api/v1/vendor/offerings/{o.id}", json={"portions_total": 5})
    assert r.status_code == 409 and "6" in r.json()["detail"]
    assert client.put(f"/api/v1/vendor/offerings/{o.id}", json={"portions_total": 6}).json()["portions_left"] == 0  # close
    db.expire_all()
    assert db.get(MenuOffering, o.id).portions_total == 6


def test_cannot_edit_someone_elses_dish(client, make_vendor, make_offering, vend):
    other = make_offering(make_vendor(name="Other"), TOMORROW)
    assert client.put(f"/api/v1/vendor/offerings/{other.id}", json={"price": 100}).status_code == 404
    assert client.delete(f"/api/v1/vendor/offerings/{other.id}").status_code == 404


def test_delete_unordered_dish_ok_but_ordered_is_409(client, db, vend, make_offering):
    free = make_offering(vend, TOMORROW, name="Free")
    ordered = make_offering(vend, TOMORROW, name="Taken", sold=2)
    assert client.delete(f"/api/v1/vendor/offerings/{free.id}").status_code == 204
    r = client.delete(f"/api/v1/vendor/offerings/{ordered.id}")
    assert r.status_code == 409 and "Close it instead" in r.json()["detail"]
    assert db.get(MenuOffering, ordered.id) is not None


def test_delete_after_all_orders_cancelled(client, db, clk, vend, make_offering, make_user, login_as):
    """Cancelled orders release portions, so the dish can be deleted again (order items keep the name; offering_id -> NULL)."""
    from app.models import OrderItem

    vend.live_override = True
    db.commit()
    o = make_offering(vend, TOMORROW)
    cust = make_user(Role.customer)
    login_as(cust)
    oid = client.post("/api/v1/orders", json={"items": [{"offering_id": o.id, "qty": 1}], "fulfilment": "pickup"}).json()["id"]
    login_as(vend.user)
    assert client.delete(f"/api/v1/vendor/offerings/{o.id}").status_code == 409
    client.post(f"/api/v1/vendor/orders/{oid}/cancel", json={"reason": "no stock"})
    assert client.delete(f"/api/v1/vendor/offerings/{o.id}").status_code == 204
    db.expire_all()
    item = db.query(OrderItem).one()
    assert item.offering_id is None and item.name == "Dal Rice"


def test_dish_photo_upload(client, db, vend, make_offering):
    o = make_offering(vend, TOMORROW)
    url = f"/api/v1/vendor/offerings/{o.id}/photo"
    assert client.post(url, files={"file": ("a.jpg", jpeg(), "image/jpeg")}).status_code == 403  # needs xhr header
    r = client.post(url, files={"file": ("a.jpg", jpeg(), "image/jpeg")}, headers=H)
    assert r.status_code == 200 and r.json()["photo"].endswith(".jpg")
    first = r.json()["photo"]
    assert client.get(f"/media/{first}").status_code == 200
    r = client.post(url, files={"file": ("b.jpg", jpeg(), "image/jpeg")}, headers=H)
    assert r.json()["photo"] != first and client.get(f"/media/{first}").status_code == 404  # old file removed
    assert client.post(url, files={"file": ("x.txt", b"hello", "text/plain")}, headers=H).status_code == 400


def test_copy_menu_resets_sold_and_shifts_cutoffs(client, db, vend, make_offering):
    base = TODAY + timedelta(days=1)
    make_offering(vend, base, Slot.lunch, name="Dal", total=10, sold=7, preset="night_before_9pm")
    make_offering(vend, base, Slot.dinner, name="Khichdi", total=8, preset="3h")
    d2, d3 = base + timedelta(days=1), base + timedelta(days=2)
    r = client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(base), "to_dates": [str(d2), str(d3)]})
    assert r.status_code == 200
    j = r.json()
    assert len(j["created"]) == 4 and j["skipped"] == 0
    assert all(o["portions_sold"] == 0 for o in j["created"])
    dal2 = next(o for o in j["created"] if o["date"] == str(d2) and o["dish_name"] == "Dal")
    local = datetime.fromisoformat(dal2["cutoff_at"]).astimezone(__import__("app.services.clock", fromlist=["tz"]).tz())
    assert (local.date(), local.hour) == (d2 - timedelta(days=1), 21)  # still "night before 9pm"
    # copying again skips duplicates; slot filter works
    r = client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(base), "to_dates": [str(d2)]}).json()
    assert r["created"] == [] and r["skipped"] == 2
    r = client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(base), "to_dates": [str(base + timedelta(days=5))], "slot": "dinner"}).json()
    assert [o["dish_name"] for o in r["created"]] == ["Khichdi"]


def test_copy_errors(client, vend, make_offering):
    assert client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(TOMORROW), "to_dates": [str(TODAY + timedelta(days=3))]}).status_code == 404
    make_offering(vend, TOMORROW)
    assert client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(TOMORROW), "to_dates": []}).status_code == 422
    assert client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(TOMORROW), "to_dates": [str(TODAY - timedelta(days=1))]}).status_code == 422


def test_copy_yesterday_into_today_skips_passed_cutoffs(client, vend, make_offering):
    y = TODAY - timedelta(days=1)
    make_offering(vend, y, Slot.lunch, name="Old lunch", preset="2h")  # -> today 10:00, ahead of 08:00: copied
    make_offering(vend, y, Slot.lunch, name="Old early", cutoff=datetime(2026, 10, 19, 1, 0, tzinfo=UTC))  # 06:30 IST -> passed today
    r = client.post("/api/v1/vendor/offerings/copy", json={"from_date": str(y), "to_dates": [str(TODAY)]}).json()
    assert [o["dish_name"] for o in r["created"]] == ["Old lunch"] and r["skipped"] == 1
