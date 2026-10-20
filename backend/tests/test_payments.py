"""Razorpay flow with mocked httpx: create, verify signature, webhook, flag off, timeout release."""
import hashlib
import hmac
import json
from datetime import timedelta

import httpx
import pytest

from app.config import get_settings
from app.models import MenuOffering, Order, OrderStatus, PaymentStatus, Role
from app.services import payments
from tests.conftest import TODAY

KEY, WH = "test_secret", "wh_secret"


def sign(secret: str, msg: str | bytes) -> str:
    return hmac.new(secret.encode(), msg.encode() if isinstance(msg, str) else msg, hashlib.sha256).hexdigest()


@pytest.fixture
def rzp(monkeypatch):
    s = get_settings()
    for k, v in dict(RAZORPAY_ENABLED=True, RAZORPAY_KEY_ID="rzp_test_x", RAZORPAY_KEY_SECRET=KEY, RAZORPAY_WEBHOOK_SECRET=WH).items():
        monkeypatch.setattr(s, k, v)
    calls = []

    def fake_post(url, **kw):
        calls.append((url, kw))
        return httpx.Response(200, json={"id": f"order_{len(calls)}"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(payments.httpx, "post", fake_post)
    return calls


@pytest.fixture
def paid_setup(clk, rzp, make_vendor, make_offering, make_user, login_as, client):
    vendor = make_vendor()
    dal = make_offering(vendor, name="Dal", total=5)
    cust = make_user(Role.customer, name="Ravi")
    login_as(cust)
    r = client.post("/api/v1/orders", json={"items": [{"offering_id": dal.id, "qty": 2}], "fulfilment": "pickup", "payment_method": "razorpay"})
    assert r.status_code == 201, r.text
    return vendor, dal, cust, r.json()


def sold(db, o):
    db.expire_all()
    return db.get(MenuOffering, o.id).portions_sold


def test_flag_off_everything_404_and_method_rejected(client, db, clk, make_vendor, make_offering, make_user, login_as):
    assert not get_settings().RAZORPAY_ENABLED
    v = make_vendor()
    d = make_offering(v)
    login_as(make_user(Role.customer))
    body = {"items": [{"offering_id": d.id, "qty": 1}], "fulfilment": "pickup", "payment_method": "razorpay"}
    assert client.post("/api/v1/orders", json=body).status_code == 422
    assert client.post("/api/v1/payments/razorpay/order", json={"order_id": 1}).status_code == 404
    assert client.post("/api/v1/payments/razorpay/verify", json={"order_id": 1, "razorpay_order_id": "a", "razorpay_payment_id": "b", "razorpay_signature": "c"}).status_code == 404
    assert client.post("/api/v1/payments/razorpay/webhook", content=b"{}").status_code == 404


def test_order_is_pending_and_reserves_capacity(client, db, paid_setup):
    _, dal, _, order = paid_setup
    assert order["payment_method"] == "razorpay" and order["payment_status"] == "pending" and order["status"] == "placed"
    assert sold(db, dal) == 2


def test_create_razorpay_order_uses_paise_basic_auth_and_is_idempotent(client, db, paid_setup, rzp):
    *_, order = paid_setup
    r = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]})
    assert r.status_code == 200, r.text
    assert r.json() == {"razorpay_order_id": "order_1", "amount": order["total"], "currency": "INR", "key_id": "rzp_test_x"}
    url, kw = rzp[0]
    assert url.endswith("/orders") and kw["auth"] == ("rzp_test_x", KEY)
    assert kw["json"]["amount"] == order["total"] and kw["json"]["receipt"] == str(order["id"])
    assert client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"] == "order_1"
    assert len(rzp) == 1
    db.expire_all()
    assert db.get(Order, order["id"]).razorpay_order_id == "order_1"


def test_create_gateway_failure_is_502(client, paid_setup, monkeypatch):
    *_, order = paid_setup

    def boom(url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(payments.httpx, "post", boom)
    assert client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).status_code == 502


def test_cannot_pay_someone_elses_order(client, paid_setup, make_user, login_as):
    *_, order = paid_setup
    login_as(make_user(Role.customer))
    assert client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).status_code == 404


def _verify(client, order, rp_id, pay_id="pay_1", sig=None):
    return client.post("/api/v1/payments/razorpay/verify", json={
        "order_id": order["id"], "razorpay_order_id": rp_id, "razorpay_payment_id": pay_id,
        "razorpay_signature": sig if sig is not None else sign(KEY, f"{rp_id}|{pay_id}")})


def test_verify_valid_signature_marks_paid_idempotently(client, db, paid_setup):
    *_, order = paid_setup
    rp = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"]
    r = _verify(client, order, rp)
    assert r.status_code == 200 and r.json()["payment_status"] == "paid"
    assert _verify(client, order, rp).json()["payment_status"] == "paid"


def test_verify_invalid_signature_rejected(client, db, paid_setup):
    *_, order = paid_setup
    rp = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"]
    assert _verify(client, order, rp, sig="deadbeef").status_code == 400
    assert _verify(client, order, rp, sig=sign("wrong", f"{rp}|pay_1")).status_code == 400
    assert _verify(client, order, "order_other").status_code == 422  # not this order's razorpay id
    db.expire_all()
    assert db.get(Order, order["id"]).payment_status == PaymentStatus.pending


def _hook(client, event, rp_id, *, amount=None, secret=WH, sig=None):
    payload = {"event": event, "payload": {"payment": {"entity": {"id": "pay_9", "order_id": rp_id, **({"amount": amount} if amount else {})}}}}
    body = json.dumps(payload).encode()
    return client.post("/api/v1/payments/razorpay/webhook", content=body,
                       headers={"X-Razorpay-Signature": sig if sig is not None else sign(secret, body), "Content-Type": "application/json"})


def test_webhook_captured_failed_and_idempotent(client, db, paid_setup):
    *_, order = paid_setup
    rp = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"]
    assert _hook(client, "payment.failed", rp).json() == {"status": "failed"}
    db.expire_all()
    assert db.get(Order, order["id"]).payment_status == PaymentStatus.failed
    assert _hook(client, "payment.captured", rp, amount=order["total"]).json() == {"status": "paid"}
    assert _hook(client, "payment.captured", rp, amount=order["total"]).json() == {"status": "already paid"}
    assert _hook(client, "payment.failed", rp).json() == {"status": "unchanged"}  # late failure can't undo a payment
    db.expire_all()
    assert db.get(Order, order["id"]).payment_status == PaymentStatus.paid


def test_webhook_bad_signature_and_amount_mismatch(client, db, paid_setup):
    *_, order = paid_setup
    rp = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"]
    assert _hook(client, "payment.captured", rp, sig="nope").status_code == 400
    assert _hook(client, "payment.captured", rp, secret="other").status_code == 400
    assert _hook(client, "payment.captured", rp, amount=1).json() == {"status": "amount mismatch"}
    assert _hook(client, "payment.captured", "order_unknown").json() == {"status": "unknown order"}
    db.expire_all()
    assert db.get(Order, order["id"]).payment_status == PaymentStatus.pending


def test_unpaid_order_hidden_from_cook_and_cannot_be_accepted(client, db, paid_setup, login_as):
    vendor, _, cust, order = paid_setup
    login_as(vendor.user)
    assert client.get("/api/v1/vendor/orders").json()["orders"] == []
    assert client.post(f"/api/v1/vendor/orders/{order['id']}/accept").status_code == 409
    login_as(cust)
    rp = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"]
    _verify(client, order, rp)
    login_as(vendor.user)
    assert len(client.get("/api/v1/vendor/orders").json()["orders"]) == 1
    assert client.post(f"/api/v1/vendor/orders/{order['id']}/accept").status_code == 200


def test_timeout_cancels_and_releases_lazily_on_read(client, db, clk, paid_setup):
    _, dal, _, order = paid_setup
    assert sold(db, dal) == 2
    clk.advance(minutes=14)
    assert client.get(f"/api/v1/orders/{order['id']}").json()["status"] == "placed"
    clk.advance(minutes=2)
    got = client.get(f"/api/v1/orders/{order['id']}").json()
    assert got["status"] == "cancelled" and "Payment not completed" in got["cancel_reason"]
    assert sold(db, dal) == 0
    # The order can no longer be paid.
    assert client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).status_code == 409


def test_timeout_via_cli_tick_and_paid_orders_survive(client, db, clk, paid_setup, monkeypatch):
    vendor, dal, cust, order = paid_setup
    rp = client.post("/api/v1/payments/razorpay/order", json={"order_id": order["id"]}).json()["razorpay_order_id"]
    _verify(client, order, rp)  # this one is paid
    r2 = client.post("/api/v1/orders", json={"items": [{"offering_id": dal.id, "qty": 1}], "fulfilment": "pickup", "payment_method": "razorpay"}).json()
    assert sold(db, dal) == 3
    clk.advance(minutes=20)
    assert payments.expire_unpaid_orders(db, clk.current) == 1
    assert payments.expire_unpaid_orders(db, clk.current) == 0  # idempotent
    db.expire_all()
    assert db.get(Order, r2["id"]).status == OrderStatus.cancelled
    assert db.get(Order, order["id"]).status == OrderStatus.placed
    assert sold(db, dal) == 2


def test_cli_materialize_runs_expiry(db, clk, paid_setup, monkeypatch):
    import app.cli as cli

    class _S:
        def __enter__(self_):
            return db
        def __exit__(self_, *a):
            return False

    monkeypatch.setattr(cli, "SessionLocal", lambda: _S())
    *_, order = paid_setup
    clk.advance(minutes=30)
    cli.materialize(1)
    db.expire_all()
    assert db.get(Order, order["id"]).status == OrderStatus.cancelled
