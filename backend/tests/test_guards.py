from fastapi import APIRouter, Depends

from app.deps import require_role, require_xhr_header
from app.main import app
from app.models import Role

_r = APIRouter()


@_r.get("/_t/vendor-only")
def _vendor_only(user=Depends(require_role(Role.vendor))):
    return {"id": user.id}


@_r.get("/_t/staff")
def _staff(user=Depends(require_role(Role.vendor, Role.admin))):
    return {"role": user.role}


@_r.post("/_t/upload", dependencies=[Depends(require_xhr_header)])
def _upload():
    return {"ok": True}


app.include_router(_r)


def test_role_guard(client, make_user, login_as):
    assert client.get("/_t/vendor-only").status_code == 401
    login_as(make_user(Role.customer))
    assert client.get("/_t/vendor-only").status_code == 403
    login_as(make_user(Role.vendor))
    assert client.get("/_t/vendor-only").status_code == 200


def test_multiple_roles(client, make_user, login_as):
    login_as(make_user(Role.admin))
    assert client.get("/_t/staff").json() == {"role": "admin"}
    login_as(make_user(Role.customer))
    assert client.get("/_t/staff").status_code == 403


def test_xhr_header(client):
    assert client.post("/_t/upload").status_code == 403
    assert client.post("/_t/upload", headers={"X-Requested-With": "gharka"}).status_code == 200


def test_cors_allows_configured_origin(client):
    r = client.options("/api/v1/health", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert r.headers["access-control-allow-credentials"] == "true"
    r = client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers
