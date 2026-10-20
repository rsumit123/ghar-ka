"""Invite-only login (AUTH_MODE=password): admin creates customers/cooks with a password; OTP is closed."""
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AuditLog, Role

PHONE = "9876543210"
E164 = "+919876543210"


@pytest.fixture
def password_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "AUTH_MODE", "password")


@pytest.fixture
def as_admin(make_user, login_as):
    admin = make_user(Role.admin)
    login_as(admin)
    return admin


def invite(client, phone=PHONE, role="vendor", password="secret-123", name="Kamala"):
    return client.post("/api/v1/admin/users", json={"phone": phone, "role": role, "password": password, "name": name})


def test_config_reports_mode(client, password_mode):
    assert client.get("/api/v1/auth/config").json() == {"mode": "password"}


def test_config_default_is_otp(client):
    assert client.get("/api/v1/auth/config").json() == {"mode": "otp"}


def test_otp_closed_in_password_mode(client, password_mode):
    r = client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "customer"})
    assert r.status_code == 403 and "invite only" in r.json()["detail"]
    r = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "role": "customer", "code": "123456"})
    assert r.status_code == 403


def test_password_login_off_in_otp_mode(client):
    r = client.post("/api/v1/auth/password/login", json={"phone": PHONE, "role": "customer", "password": "x"})
    assert r.status_code == 404


def test_invite_then_login(client, db, password_mode, as_admin):
    r = invite(client)
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == E164 and r.json()["role"] == "vendor" and r.json()["has_password"]
    assert db.scalar(select(AuditLog).where(AuditLog.action == "user.invite")) is not None

    client.cookies.clear()
    r = client.post("/api/v1/auth/password/login", json={"phone": PHONE, "role": "vendor", "password": "secret-123"})
    assert r.status_code == 200, r.text
    assert get_settings().COOKIE_NAME in r.headers["set-cookie"]
    assert client.get("/api/v1/auth/me").json()["role"] == "vendor"


def test_wrong_password_unknown_phone_and_wrong_role(client, password_mode, as_admin):
    invite(client)
    client.cookies.clear()
    url = "/api/v1/auth/password/login"
    assert client.post(url, json={"phone": PHONE, "role": "vendor", "password": "nope-nope"}).status_code == 401
    assert client.post(url, json={"phone": "9000000000", "role": "vendor", "password": "secret-123"}).status_code == 401
    # an invite is per role: the cook's password doesn't log in a customer with the same phone
    assert client.post(url, json={"phone": PHONE, "role": "customer", "password": "secret-123"}).status_code == 401
    assert client.post(url, json={"phone": PHONE, "role": "admin", "password": "secret-123"}).status_code == 422


def test_reinvite_resets_password_and_logs_out(client, password_mode, as_admin, db):
    from app.models import User
    from app.services.sessions import create_session, get_user_for_token
    invite(client)
    cook_token = create_session(db, db.scalar(select(User).where(User.phone == E164)))
    r = invite(client, password="new-secret-1", name="")
    assert r.status_code == 200 and r.json()["name"] == "Kamala"  # blank name keeps the old one
    assert get_user_for_token(db, cook_token) is None  # the cook's existing session is revoked
    client.cookies.clear()
    url = "/api/v1/auth/password/login"
    assert client.post(url, json={"phone": PHONE, "role": "vendor", "password": "secret-123"}).status_code == 401
    assert client.post(url, json={"phone": PHONE, "role": "vendor", "password": "new-secret-1"}).status_code == 200


def test_invite_validation_and_admin_only(client, make_user, login_as, password_mode):
    login_as(make_user(Role.customer))
    assert invite(client).status_code == 403
    login_as(make_user(Role.admin))
    assert invite(client, password="short").status_code == 422
    assert invite(client, phone="123").status_code == 422
    assert invite(client, role="admin").status_code == 422


def test_list_users(client, password_mode, as_admin):
    invite(client, role="vendor")
    invite(client, phone="9000000001", role="customer", name="Ravi")
    all_users = client.get("/api/v1/admin/users").json()
    assert {u["role"] for u in all_users} == {"vendor", "customer"}  # admins are not listed
    cooks = client.get("/api/v1/admin/users", params={"role": "vendor"}).json()
    assert [u["phone"] for u in cooks] == [E164]


@pytest.fixture
def shared_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "AUTH_MODE", "shared_password")
    monkeypatch.setattr(get_settings(), "SHARED_LOGIN_PASSWORD", "let-me-in")


def test_shared_password_creates_and_reuses_users(client, db, shared_mode):
    from app.models import User
    url = "/api/v1/auth/password/login"
    assert client.get("/api/v1/auth/config").json() == {"mode": "password"}
    r = client.post(url, json={"phone": PHONE, "role": "vendor", "password": "let-me-in"})
    assert r.status_code == 200 and r.json()["role"] == "vendor"
    assert client.post(url, json={"phone": PHONE, "role": "vendor", "password": "let-me-in"}).json()["id"] == r.json()["id"]
    assert client.post(url, json={"phone": PHONE, "role": "customer", "password": "let-me-in"}).status_code == 200
    assert len(db.scalars(select(User)).all()) == 2
    assert client.post(url, json={"phone": PHONE, "role": "vendor", "password": "wrong"}).status_code == 401
    assert client.post(url, json={"phone": "12345", "role": "vendor", "password": "let-me-in"}).status_code == 422
    assert client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "vendor"}).status_code == 403


def test_shared_password_unset_rejects_everyone(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "AUTH_MODE", "shared_password")
    monkeypatch.setattr(get_settings(), "SHARED_LOGIN_PASSWORD", "")
    r = client.post("/api/v1/auth/password/login", json={"phone": PHONE, "role": "vendor", "password": ""})
    assert r.status_code in (401, 422)
