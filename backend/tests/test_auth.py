from datetime import timedelta

from sqlalchemy import select

from app.config import get_settings
from app.db import utcnow
from app.models import OtpCode, Role
from app.services.security import hash_password

PHONE = "9876543210"
E164 = "+919876543210"


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_localities_public(client):
    assert client.get("/api/v1/localities").json() == []


def test_me_requires_login(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_otp_flow(client, sms, db):
    r = client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "customer"})
    assert r.status_code == 200
    code = sms.last_code(E164)
    # stored hashed, not plain
    assert db.scalar(select(OtpCode)).code_hash != code

    r = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "role": "customer", "code": code})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == E164 and r.json()["role"] == "customer"
    cookie = r.headers["set-cookie"].lower()
    assert get_settings().COOKIE_NAME in cookie and "httponly" in cookie and "samesite=lax" in cookie

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["phone"] == E164

    # code is single-use
    again = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "role": "customer", "code": code})
    assert again.status_code == 400

    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_same_phone_can_be_customer_and_vendor(client, sms):
    ids = {}
    for role in ("customer", "vendor"):
        client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": role})
        r = client.post("/api/v1/auth/otp/verify",
                        json={"phone": PHONE, "role": role, "code": sms.last_code(E164)})
        ids[role] = r.json()["id"]
    assert ids["customer"] != ids["vendor"]


def test_wrong_code_attempts_lock_out(client, sms):
    client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "customer"})
    good = sms.last_code(E164)
    bad = "000000" if good != "000000" else "111111"
    for _ in range(get_settings().OTP_MAX_ATTEMPTS):
        r = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "role": "customer", "code": bad})
        assert r.status_code == 400
    # even the right code is now refused
    r = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "role": "customer", "code": good})
    assert r.status_code == 429
    assert client.get("/api/v1/auth/me").status_code == 401


def test_expired_code(client, sms, db):
    client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "customer"})
    otp = db.scalar(select(OtpCode))
    otp.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    r = client.post("/api/v1/auth/otp/verify",
                    json={"phone": PHONE, "role": "customer", "code": sms.last_code(E164)})
    assert r.status_code == 400


def test_request_rate_limit(client):
    limit = get_settings().OTP_RATE_LIMIT_COUNT
    for _ in range(limit):
        assert client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "customer"}).status_code == 200
    assert client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "customer"}).status_code == 429


def test_otp_rejects_bad_phone_and_admin_role(client):
    assert client.post("/api/v1/auth/otp/request", json={"phone": "123", "role": "customer"}).status_code == 422
    assert client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "admin"}).status_code == 422


def test_admin_login(client, make_user):
    make_user(Role.admin, email="boss@example.com", password_hash=hash_password("s3cretpass"))
    bad = client.post("/api/v1/auth/admin/login", json={"email": "boss@example.com", "password": "nope"})
    assert bad.status_code == 401
    unknown = client.post("/api/v1/auth/admin/login", json={"email": "x@example.com", "password": "nope"})
    assert unknown.status_code == 401
    ok = client.post("/api/v1/auth/admin/login", json={"email": "Boss@Example.com", "password": "s3cretpass"})
    assert ok.status_code == 200 and ok.json()["role"] == "admin"
    assert client.get("/api/v1/auth/me").json()["email"] == "boss@example.com"


def test_session_expiry_and_revocation(client, make_user, login_as, db):
    from app.models import AuthSession

    user = make_user(Role.customer)
    login_as(user)
    assert client.get("/api/v1/auth/me").status_code == 200
    sess = db.scalar(select(AuthSession))
    sess.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    assert client.get("/api/v1/auth/me").status_code == 401
