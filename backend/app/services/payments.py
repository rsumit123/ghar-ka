"""Razorpay (test or live) via plain REST + HMAC; no SDK. Everything is behind RAZORPAY_ENABLED.

Flow: place_order(payment_method=razorpay) -> order `placed`/payment `pending` (portions reserved) ->
create_razorpay_order() -> browser pays -> verify_payment() (signature) or webhook -> payment `paid`.
Unpaid online orders are cancelled by `expire_unpaid_orders` after RAZORPAY_PAYMENT_TIMEOUT_MINUTES.
Refunds are NOT automated: cancelling a paid online order leaves payment_status=paid and needs a manual refund
from the Razorpay dashboard.
"""
import hashlib
import hmac
import json
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Order, OrderStatus, PaymentMethod, PaymentStatus
from app.services.audit import write_audit
from app.services.orders import OrderError, release_portions


class PaymentError(OrderError):
    pass


def enabled() -> bool:
    return get_settings().RAZORPAY_ENABLED


def _sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(razorpay_order_id: str, payment_id: str, signature: str) -> bool:
    """Checkout signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret), compared in constant time."""
    secret = get_settings().RAZORPAY_KEY_SECRET
    if not secret or not signature:
        return False
    return hmac.compare_digest(_sign(secret, f"{razorpay_order_id}|{payment_id}".encode()), signature)


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    secret = get_settings().RAZORPAY_WEBHOOK_SECRET
    if not secret or not signature:
        return False
    return hmac.compare_digest(_sign(secret, body), signature)


def create_razorpay_order(db: Session, order: Order) -> dict:
    """Create (once) the Razorpay order for our order. Idempotent: reuses a stored razorpay_order_id."""
    s = get_settings()
    if order.payment_method != PaymentMethod.razorpay:
        raise PaymentError("This order is cash on delivery.", 409)
    if order.status == OrderStatus.cancelled:
        raise PaymentError("This order was cancelled. Please place it again.", 409)
    if order.payment_status == PaymentStatus.paid:
        raise PaymentError("This order is already paid.", 409)
    if not order.razorpay_order_id:
        try:
            resp = httpx.post(
                f"{s.RAZORPAY_API_URL.rstrip('/')}/orders",
                auth=(s.RAZORPAY_KEY_ID, s.RAZORPAY_KEY_SECRET),
                json={"amount": order.total, "currency": "INR", "receipt": str(order.id), "notes": {"order_id": str(order.id)}},
                timeout=10.0,
            )
            resp.raise_for_status()
            rp_id = resp.json()["id"]
        except (httpx.HTTPError, KeyError, ValueError):
            raise PaymentError("Could not start the payment. Please try again.", 502) from None
        order.razorpay_order_id = rp_id
        db.commit()
    return {"razorpay_order_id": order.razorpay_order_id, "amount": order.total, "currency": "INR", "key_id": s.RAZORPAY_KEY_ID}


def mark_paid(db: Session, order: Order, payment_id: str | None, now: datetime, source: str) -> bool:
    """Idempotent. Returns True if this call changed the order."""
    res = db.execute(
        update(Order).where(Order.id == order.id, Order.payment_status != PaymentStatus.paid)
        .values(payment_status=PaymentStatus.paid, updated_at=now).execution_options(synchronize_session=False)
    )
    if res.rowcount:
        write_audit(db, None, "payment.paid", "order", order.id, {"source": source, "payment_id": payment_id,
                                                                  "order_status": order.status.value})
    db.commit()
    db.refresh(order)
    return bool(res.rowcount)


def mark_failed(db: Session, order: Order, now: datetime) -> bool:
    res = db.execute(
        update(Order).where(Order.id == order.id, Order.payment_status == PaymentStatus.pending)
        .values(payment_status=PaymentStatus.failed, updated_at=now).execution_options(synchronize_session=False)
    )
    db.commit()
    db.refresh(order)
    return bool(res.rowcount)


def verify_payment(db: Session, order: Order, rp_order_id: str, payment_id: str, signature: str, now: datetime) -> Order:
    if order.payment_method != PaymentMethod.razorpay or not order.razorpay_order_id or order.razorpay_order_id != rp_order_id:
        raise PaymentError("This payment doesn't match your order.", 422)
    if not verify_payment_signature(rp_order_id, payment_id, signature):
        raise PaymentError("Payment could not be verified.", 400)
    if order.payment_status == PaymentStatus.paid:
        return order
    # Signature is valid: money was taken. Record it even if the order timed out meanwhile (needs a manual refund).
    mark_paid(db, order, payment_id, now, "verify")
    return order


def handle_webhook(db: Session, body: bytes, now: datetime) -> str:
    """Process a verified webhook body. Returns a short result string; unknown events/orders are ignored (200)."""
    try:
        data = json.loads(body)
        event = data["event"]
        entity = data["payload"]["payment"]["entity"]
        rp_order_id = entity["order_id"]
    except (ValueError, KeyError, TypeError):
        return "ignored"
    order = db.scalar(select(Order).where(Order.razorpay_order_id == rp_order_id))
    if order is None:
        return "unknown order"
    if event in ("payment.captured", "order.paid"):
        if entity.get("amount") not in (None, order.total):
            write_audit(db, None, "payment.amount_mismatch", "order", order.id, {"amount": entity.get("amount")})
            db.commit()
            return "amount mismatch"
        return "paid" if mark_paid(db, order, entity.get("id"), now, "webhook") else "already paid"
    if event == "payment.failed":
        return "failed" if mark_failed(db, order, now) else "unchanged"
    return "ignored"


def expire_unpaid_orders(db: Session, now: datetime, *, customer_id: int | None = None, vendor_id: int | None = None) -> int:
    """Cancel online orders still unpaid after the timeout and give their portions back. Idempotent and race-safe
    (the optimistic UPDATE only matches orders still `placed`)."""
    s = get_settings()
    if not s.RAZORPAY_ENABLED:
        return 0
    q = select(Order).where(
        Order.payment_method == PaymentMethod.razorpay,
        Order.payment_status.in_([PaymentStatus.pending, PaymentStatus.failed]),
        Order.status == OrderStatus.placed,
        Order.created_at <= now - timedelta(minutes=s.RAZORPAY_PAYMENT_TIMEOUT_MINUTES),
    )
    if customer_id is not None:
        q = q.where(Order.customer_id == customer_id)
    if vendor_id is not None:
        q = q.where(Order.vendor_id == vendor_id)
    count = 0
    for order in db.scalars(q).all():
        res = db.execute(
            update(Order).where(Order.id == order.id, Order.status == OrderStatus.placed,
                                Order.payment_status != PaymentStatus.paid)
            .values(status=OrderStatus.cancelled, cancel_reason="Payment not completed in time", updated_at=now)
            .execution_options(synchronize_session=False)
        )
        if res.rowcount:
            # Portions go back (release_portions leaves dishes whose cutoff has passed closed).
            release_portions(db, order, now)
            count += 1
        db.commit()
    db.expire_all()
    return count
