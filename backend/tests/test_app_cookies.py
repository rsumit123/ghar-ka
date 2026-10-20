"""Each site (X-App: customer|vendor) has its own session cookie, so logging in on one doesn't log you out of the other."""
import pytest

from app.config import get_settings
from app.models import Role
from app.services.security import hash_password

PHONE = "9876543210"


@pytest.fixture
def shared_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "AUTH_MODE", "shared_password")
    monkeypatch.setattr(get_settings(), "SHARED_LOGIN_PASSWORD", "let-me-in")


def login(client, role, app):
    return client.post("/api/v1/auth/password/login", headers={"X-App": app},
                       json={"phone": PHONE, "role": role, "password": "let-me-in"})


def me(client, app=None):
    return client.get("/api/v1/auth/me", headers={"X-App": app} if app else {})


def test_cook_and_customer_sessions_coexist(client, shared_mode):
    name = get_settings().COOKIE_NAME
    assert f"{name}_vendor=" in login(client, "vendor", "vendor").headers["set-cookie"]
    assert f"{name}_customer=" in login(client, "customer", "customer").headers["set-cookie"]
    assert me(client, "vendor").json()["role"] == "vendor"
    assert me(client, "customer").json()["role"] == "customer"


def test_logout_only_affects_one_site(client, shared_mode):
    login(client, "vendor", "vendor")
    login(client, "customer", "customer")
    assert client.post("/api/v1/auth/logout", headers={"X-App": "customer"}).status_code == 200
    assert me(client, "customer").status_code == 401
    assert me(client, "vendor").json()["role"] == "vendor"


def test_admin_login_uses_vendor_cookie_and_plain_links_work(client, make_user):
    make_user(Role.admin, email="a@x.in", password_hash=hash_password("pw-12345678"))
    r = client.post("/api/v1/auth/admin/login", headers={"X-App": "vendor"}, json={"email": "a@x.in", "password": "pw-12345678"})
    assert r.status_code == 200
    assert me(client, "customer").status_code == 401  # the customer site isn't logged in as admin
    assert me(client).json()["role"] == "admin"  # no header (e.g. an admin document link) falls back to the vendor cookie


def test_unknown_app_header_uses_plain_cookie(client, shared_mode):
    r = client.post("/api/v1/auth/password/login", headers={"X-App": "other"},
                    json={"phone": PHONE, "role": "customer", "password": "let-me-in"})
    assert r.headers["set-cookie"].startswith(f"{get_settings().COOKIE_NAME}=")
    assert me(client).json()["role"] == "customer"
