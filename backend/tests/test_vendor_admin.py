import io
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import select

from app.config import get_settings
from app.models import AuditLog, AuthSession, FssaiStatus, Locality, ReviewStatus, Role, Vendor, VendorMedia

XHR = {"X-Requested-With": "gharka"}


def jpeg(size=(400, 300), color=(200, 100, 50), exif_orientation=None) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    kw = {}
    if exif_orientation:
        ex = Image.Exif()
        ex[0x0112] = exif_orientation
        ex[0x010F] = "SecretCam"
        kw["exif"] = ex
    img.save(buf, "JPEG", **kw)
    return buf.getvalue()


@pytest.fixture
def locality(db):
    loc = Locality(name="Koramangala", city="Bengaluru", pincode="560034", lat=12.93, lng=77.62)
    db.add(loc)
    db.commit()
    return loc


@pytest.fixture
def vendor_user(make_user, login_as):
    u = make_user(Role.vendor, phone="+919876500001")
    login_as(u)
    return u


def upload(client, kind, data=None, name="x.jpg", ctype="image/jpeg", headers=XHR):
    return client.post("/api/v1/vendor/media", data={"kind": kind}, headers=headers,
                       files={"file": (name, data if data is not None else jpeg(), ctype)})


def onboard(client, locality, **extra):
    return client.post("/api/v1/vendor/onboard", json={
        "display_name": "Sunita Devi", "story": "Rajma chawal like home", "locality_id": locality.id, **extra})


def test_me_before_onboarding(client, vendor_user):
    assert client.get("/api/v1/vendor/me").json()["onboarded"] is False


def test_onboard_flow_and_doc_auto_advance(client, db, vendor_user, locality):
    r = onboard(client, locality)
    assert r.status_code == 201, r.text
    me = r.json()
    assert me["lat"] == locality.lat and me["pincode"] == "560034"  # centroid fallback
    assert me["whatsapp_phone"] == "+919876500001"
    assert me["review_status"] == "pending" and me["is_live"] is False
    assert me["fssai"]["status"] == "docs_pending" and len(me["missing_docs"]) == 3
    assert onboard(client, locality).status_code == 409

    for kind in ("id_proof", "address_proof"):
        assert upload(client, kind).status_code == 201
    assert client.get("/api/v1/vendor/me").json()["fssai"]["status"] == "docs_pending"
    # PDF allowed for private docs
    r = upload(client, "passport_photo", b"%PDF-1.4 fake pdf body", "d.pdf", "application/pdf")
    assert r.status_code == 201 and r.json()["is_pdf"] is True and r.json()["docs_advanced"] is True
    me = client.get("/api/v1/vendor/me").json()
    assert me["fssai"]["status"] == "docs_received" and me["docs_complete"]
    log = db.scalar(select(AuditLog).where(AuditLog.action == "fssai.docs_received"))
    assert log.actor_id == vendor_user.id and log.entity_id == me["id"]
    # private paths are never exposed to the vendor API
    assert all(m["path"] is None for m in me["media"] if m["is_private"])


def test_onboard_pincode_only_and_validation(client, vendor_user, locality):
    r = client.post("/api/v1/vendor/onboard", json={"display_name": "A B", "pincode": "999999", "lat": 1.5, "lng": 2.5,
                                                    "whatsapp_phone": "9811111111"})
    assert r.status_code == 201 and r.json()["lat"] == 1.5 and r.json()["whatsapp_phone"] == "+919811111111"
    assert r.json()["locality_id"] is None
    r = client.post("/api/v1/vendor/onboard", json={"display_name": "x"})
    assert r.status_code == 422


def test_vendor_endpoints_need_vendor_role(client, make_user, login_as):
    assert client.get("/api/v1/vendor/me").status_code == 401
    login_as(make_user(Role.customer))
    assert client.get("/api/v1/vendor/me").status_code == 403


def test_profile_fulfilment_and_media_rules(client, vendor_user, locality):
    onboard(client, locality)
    assert client.put("/api/v1/vendor/profile", json={"story": "New story", "whatsapp_phone": "9822222222"}).json()["story"] == "New story"
    me = client.put("/api/v1/vendor/fulfilment", json={"offers_pickup": False, "delivery_radius_km": 3.5}).json()
    assert me["offers_pickup"] is False and me["delivery_radius_km"] == 3.5
    assert client.put("/api/v1/vendor/fulfilment", json={"offers_pickup": True, "delivery_radius_km": 11}).status_code == 422

    assert upload(client, "kitchen", headers={}).status_code == 403  # needs X-Requested-With
    first = upload(client, "profile").json()
    second = upload(client, "profile").json()
    media = client.get("/api/v1/vendor/me").json()["media"]
    assert [m["id"] for m in media if m["kind"] == "profile"] == [second["id"]] and first["id"] != second["id"]
    for _ in range(6):
        assert upload(client, "kitchen").status_code == 201
    assert upload(client, "kitchen").status_code == 422
    # PDF not allowed for public kinds; junk rejected
    assert upload(client, "kitchen", b"%PDF-1.4 x", "a.pdf", "application/pdf").status_code in (400, 422)
    assert upload(client, "id_proof", b"not an image at all").status_code == 400
    assert upload(client, "id_proof", b"").status_code == 400


def test_delete_media_only_own(client, db, vendor_user, locality, make_user, login_as):
    onboard(client, locality)
    mid = upload(client, "kitchen").json()["id"]
    path = db.get(VendorMedia, mid).path
    f = Path(get_settings().UPLOAD_DIR) / "public" / path
    assert f.exists()
    other = make_user(Role.vendor)
    login_as(other)
    assert client.delete(f"/api/v1/vendor/media/{mid}").status_code == 404
    login_as(vendor_user)
    assert client.delete(f"/api/v1/vendor/media/{mid}").status_code == 204
    assert not f.exists()


def test_size_limit(client, vendor_user, locality, monkeypatch):
    onboard(client, locality)
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    get_settings.cache_clear()
    try:
        r = upload(client, "kitchen", b"\xff\xd8" + b"0" * (1024 * 1024 + 10))
        assert r.status_code == 413
    finally:
        monkeypatch.delenv("MAX_UPLOAD_MB")
        get_settings.cache_clear()


def test_image_processing_resizes_and_strips_exif(client, db, vendor_user, locality):
    onboard(client, locality)
    # 3000x1000 landscape pixels flagged rotate-90 -> portrait 1000x3000 -> max side 1600
    data = jpeg((3000, 1000), exif_orientation=6)
    assert "SecretCam" in str(Image.open(io.BytesIO(data)).getexif().get(0x010F))
    mid = upload(client, "kitchen", data, "../../evil.php", "text/html").json()["id"]
    m = db.get(VendorMedia, mid)
    assert m.path.endswith(".jpg") and "evil" not in m.path and ".." not in m.path
    out = Image.open(Path(get_settings().UPLOAD_DIR) / "public" / m.path)
    assert out.format == "JPEG" and max(out.size) == 1600
    assert out.size[1] > out.size[0]  # orientation applied
    assert len(out.getexif()) == 0
    # served publicly
    assert client.get(f"/media/{m.path}").status_code == 200


def test_png_with_alpha_converted(client, vendor_user, locality):
    onboard(client, locality)
    buf = io.BytesIO()
    Image.new("RGBA", (50, 50), (0, 0, 0, 0)).save(buf, "PNG")
    assert upload(client, "kitchen", buf.getvalue(), "a.png", "image/png").status_code == 201


def setup_vendor_with_docs(client, locality):
    onboard(client, locality)
    ids = {}
    for kind in ("id_proof", "address_proof", "passport_photo"):
        ids[kind] = upload(client, kind).json()["id"]
    return client.get("/api/v1/vendor/me").json()["id"], ids


def test_private_media_not_public_and_admin_only(client, db, vendor_user, locality, make_user, login_as):
    vid, ids = setup_vendor_with_docs(client, locality)
    m = db.get(VendorMedia, ids["id_proof"])
    assert m.is_private
    private_file = Path(get_settings().UPLOAD_DIR) / "private" / m.path
    assert private_file.exists()
    assert not (Path(get_settings().UPLOAD_DIR) / "public" / m.path).exists()
    assert client.get(f"/media/{m.path}").status_code == 404
    assert client.get(f"/api/v1/admin/media/{m.id}").status_code == 403  # vendor
    client.cookies.clear()
    assert client.get(f"/api/v1/admin/media/{m.id}").status_code == 401
    login_as(make_user(Role.customer))
    assert client.get(f"/api/v1/admin/media/{m.id}").status_code == 403
    login_as(make_user(Role.admin))
    r = client.get(f"/api/v1/admin/media/{m.id}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert "no-store" in r.headers["cache-control"]
    assert client.get("/api/v1/admin/media/99999").status_code == 404


@pytest.fixture
def admin(make_user, login_as):
    a = make_user(Role.admin)
    return a


def as_admin(client, login_as, admin):
    client.cookies.clear()
    login_as(admin)


def test_admin_requires_admin(client, vendor_user):
    for path in ("/dashboard", "/vendors", "/fssai", "/audit"):
        assert client.get(f"/api/v1/admin{path}").status_code == 403


def test_full_review_flow(client, db, vendor_user, locality, admin, login_as):
    vid, _ = setup_vendor_with_docs(client, locality)
    as_admin(client, login_as, admin)

    d = client.get("/api/v1/admin/dashboard").json()
    assert d["pending_vendors"] == 1 and d["live_vendors"] == 0
    for key in ("active_vendors", "orders_today", "orders_this_week", "repeat_customer_rate", "fssai_expiring_60d"):
        assert key in d

    lst = client.get("/api/v1/admin/vendors", params={"status": "pending", "q": "sunita"}).json()
    assert len(lst) == 1 and lst[0]["docs_complete"] and lst[0]["fssai_status"] == "docs_received" and lst[0]["is_live"] is False
    assert client.get("/api/v1/admin/vendors", params={"status": "approved"}).json() == []

    det = client.get(f"/api/v1/admin/vendors/{vid}").json()
    assert det["lat"] == 12.93 and len([m for m in det["media"] if m["is_private"]]) == 3
    assert all(m["admin_url"].startswith("/api/v1/admin/media/") for m in det["media"])

    # approve alone does not go live
    assert client.post(f"/api/v1/admin/vendors/{vid}/approve", json={}).json()["is_live"] is False
    # FSSAI validation
    url = f"/api/v1/admin/vendors/{vid}/fssai"
    assert client.put(url, json={"status": "registration_issued"}).status_code == 422
    assert client.put(url, json={"status": "registration_issued", "registration_number": "123"}).status_code == 422
    assert client.put(url, json={"status": "application_filed", "issue_date": "2026-05-01", "expiry_date": "2026-04-01"}).status_code == 422
    assert client.put(url, json={"status": "application_filed", "application_id": "APP1"}).status_code == 200
    r = client.put(url, json={"status": "registration_issued", "registration_number": "10020", "issue_date": "2026-01-01",
                              "expiry_date": "2099-01-01"})
    assert r.status_code == 200 and r.json()["is_live"] is True
    assert client.get("/api/v1/admin/dashboard").json()["live_vendors"] == 1

    log = db.scalars(select(AuditLog).where(AuditLog.action == "vendor.fssai_update").order_by(AuditLog.id)).all()
    assert log[-1].details["before"]["status"] == "application_filed" and log[-1].details["after"]["status"] == "registration_issued"
    assert log[-1].actor_id == admin.id

    # expiry in the past -> not live
    client.put(url, json={"status": "registration_issued", "registration_number": "10020", "issue_date": "2020-01-01",
                          "expiry_date": "2021-01-01"})
    assert client.get(f"/api/v1/admin/vendors/{vid}").json()["is_live"] is False


def test_reject_requires_note_and_resubmit(client, db, vendor_user, locality, admin, login_as):
    vid, _ = setup_vendor_with_docs(client, locality)
    as_admin(client, login_as, admin)
    assert client.post(f"/api/v1/admin/vendors/{vid}/reject", json={}).status_code == 422
    assert client.post(f"/api/v1/admin/vendors/{vid}/reject", json={"note": "ID photo is blurry"}).status_code == 200
    # admin can't reject twice
    assert client.post(f"/api/v1/admin/vendors/{vid}/reject", json={"note": "again again"}).status_code == 409
    login_as(vendor_user)
    me = client.get("/api/v1/vendor/me").json()
    assert me["review_status"] == "rejected" and me["review_note"] == "ID photo is blurry"
    assert upload(client, "id_proof").status_code == 201
    me = client.post("/api/v1/vendor/resubmit").json()
    assert me["review_status"] == "pending"
    assert client.post("/api/v1/vendor/resubmit").status_code == 409
    # editing profile while rejected also resubmits
    as_admin(client, login_as, admin)
    client.post(f"/api/v1/admin/vendors/{vid}/reject", json={"note": "still wrong"})
    login_as(vendor_user)
    assert client.put("/api/v1/vendor/profile", json={"story": "fixed"}).json()["review_status"] == "pending"


def test_override_requires_reason_and_is_logged(client, db, vendor_user, locality, admin, login_as):
    vid, _ = setup_vendor_with_docs(client, locality)
    as_admin(client, login_as, admin)
    url = f"/api/v1/admin/vendors/{vid}/override"
    assert client.put(url, json={"enabled": True}).status_code == 422
    assert client.put(url, json={"enabled": True, "reason": "abc"}).status_code == 422
    r = client.put(url, json={"enabled": True, "reason": "Trusted cook, FSSAI in progress"})
    assert r.status_code == 200 and r.json()["is_live"] is True
    log = db.scalar(select(AuditLog).where(AuditLog.action == "vendor.override"))
    assert log.actor_id == admin.id and log.details["after"] == {"live_override": True, "reason": "Trusted cook, FSSAI in progress"}
    assert log.details["before"]["live_override"] is False
    r = client.put(url, json={"enabled": False, "reason": "Docs lapsed again"})
    assert r.json()["is_live"] is False
    assert db.scalars(select(AuditLog).where(AuditLog.action == "vendor.override")).all().__len__() == 2


def test_suspend_revokes_sessions(client, db, vendor_user, locality, admin, login_as, make_user):
    vid, _ = setup_vendor_with_docs(client, locality)
    assert client.get("/api/v1/vendor/me").status_code == 200
    vendor_cookie = client.cookies.get(get_settings().COOKIE_NAME)
    as_admin(client, login_as, admin)
    client.put(f"/api/v1/admin/vendors/{vid}/override", json={"enabled": True, "reason": "testing suspend"})
    r = client.post(f"/api/v1/admin/vendors/{vid}/suspend", json={"note": "complaints"})
    assert r.status_code == 200 and r.json()["is_live"] is False  # suspension beats override
    assert db.scalars(select(AuthSession).where(AuthSession.user_id == vendor_user.id)).all() == []
    client.cookies.clear()
    client.cookies.set(get_settings().COOKIE_NAME, vendor_cookie)
    assert client.get("/api/v1/vendor/me").status_code == 401
    as_admin(client, login_as, admin)
    # unsuspend: never approved -> back to pending queue
    assert client.post(f"/api/v1/admin/vendors/{vid}/unsuspend", json={}).json()["review_status"] == "pending"
    client.post(f"/api/v1/admin/vendors/{vid}/approve", json={})
    client.post(f"/api/v1/admin/vendors/{vid}/suspend", json={})
    assert client.post(f"/api/v1/admin/vendors/{vid}/unsuspend", json={}).json()["review_status"] == "approved"


def test_fssai_tracker_and_audit_pagination(client, db, vendor_user, locality, admin, login_as, make_user):
    from datetime import timedelta
    from app.services.clock import local_today
    vid, _ = setup_vendor_with_docs(client, locality)
    other = make_user(Role.vendor)
    v2 = Vendor(user_id=other.id, display_name="Other", review_status=ReviewStatus.approved)
    from app.models import FssaiRecord
    v2.fssai = FssaiRecord(status=FssaiStatus.registration_issued, registration_number="9", expiry_date=local_today() + timedelta(days=10))
    db.add(v2)
    db.commit()
    as_admin(client, login_as, admin)
    client.put(f"/api/v1/admin/vendors/{vid}/fssai", json={"status": "registration_issued", "registration_number": "1",
               "issue_date": "2025-01-01", "expiry_date": (local_today() + timedelta(days=200)).isoformat()})
    rows = client.get("/api/v1/admin/fssai").json()
    assert [r["vendor_id"] for r in rows] == [v2.id, vid]  # sorted by expiry
    soon = client.get("/api/v1/admin/fssai", params={"expiring_within": 60}).json()
    assert [r["vendor_id"] for r in soon] == [v2.id] and soon[0]["days_left"] == 10
    assert client.get("/api/v1/admin/dashboard").json()["fssai_expiring_60d"] == 1

    page = client.get("/api/v1/admin/audit", params={"page_size": 2}).json()
    assert page["total"] >= 3 and len(page["items"]) == 2 and page["items"][0]["id"] > page["items"][1]["id"]
    scoped = client.get("/api/v1/admin/audit", params={"entity": "vendor", "entity_id": vid}).json()
    assert scoped["items"] and all(i["entity_id"] == vid for i in scoped["items"])


def test_admin_creates_locality(client, admin, login_as, db):
    login_as(admin)
    r = client.post("/api/v1/admin/localities", json={"name": "HSR Layout", "city": "Bengaluru", "pincode": "560102",
                                                      "lat": 12.91, "lng": 77.64})
    assert r.status_code == 201
    assert any(l["name"] == "HSR Layout" for l in client.get("/api/v1/localities").json())
    assert db.scalar(select(AuditLog).where(AuditLog.action == "locality.create")) is not None
    assert client.post("/api/v1/admin/localities", json={"name": "x", "city": "y", "pincode": "1", "lat": 1, "lng": 1}).status_code == 422
