"""Concurrent buyers on a file-based SQLite DB with separate sessions/connections: never oversell."""
import threading
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.db import make_engine
from app.models import MenuOffering, Order, OrderItem, OrderStatus, Role
from app.schemas.order import OrderIn
from app.services import clock
from app.services import orders as order_service
from tests.conftest import TODAY


def _race(db, customers, offering_ids, qty, total_threads):
    """Fire `total_threads` simultaneous place_order calls (each from its own Session) and collect outcomes."""
    # NB: keep total_threads <= 14: each worker holds a pooled connection (QueuePool default is 5 + 10 overflow).
    engine = make_engine(db.get_bind().url.render_as_string(hide_password=False))
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    barrier = threading.Barrier(total_threads)
    results: list[str] = [""] * total_threads

    def worker(i: int):
        s = Session()
        try:
            customer = s.get(type(customers[0]), customers[i % len(customers)].id)
            payload = OrderIn(items=[{"offering_id": oid, "qty": qty} for oid in offering_ids], fulfilment="pickup")
            barrier.wait(timeout=10)
            order_service.place_order(s, customer, payload, clock.now())
            results[i] = "ok"
        except order_service.OrderError as e:
            results[i] = f"err:{e.status_code}"
        except Exception as e:  # noqa: BLE001 - surfaced by the assertions below
            results[i] = f"boom:{type(e).__name__}:{e}"
        finally:
            s.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(total_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    engine.dispose()
    return results


def test_racing_buyers_never_oversell(db, clk, make_vendor, make_offering, make_user):
    vendor = make_vendor()
    dal = make_offering(vendor, name="Dal", total=10)
    customers = [make_user(Role.customer) for _ in range(6)]

    results = _race(db, customers, [dal.id], qty=2, total_threads=12)  # demand 24 for 10 portions

    assert not [r for r in results if r.startswith("boom")], results
    assert results.count("ok") == 5 and results.count("err:409") == 7
    db.expire_all()
    assert db.get(MenuOffering, dal.id).portions_sold == 10
    assert db.scalar(select(func.sum(OrderItem.qty))) == 10
    assert db.scalar(select(func.count(Order.id))) == 5


def test_race_for_last_portion_has_single_winner(db, clk, make_vendor, make_offering, make_user):
    vendor = make_vendor()
    last = make_offering(vendor, name="Last thali", total=1)
    customers = [make_user(Role.customer) for _ in range(8)]
    results = _race(db, customers, [last.id], qty=1, total_threads=8)
    assert results.count("ok") == 1 and not [r for r in results if r.startswith("boom")], results
    db.expire_all()
    assert db.get(MenuOffering, last.id).portions_sold == 1


def test_racing_multi_item_orders_stay_consistent(db, clk, make_vendor, make_offering, make_user):
    """Each order wants 2 dal + 2 roti. Dal allows 5 orders, roti only 3: exactly 3 win and neither counter drifts."""
    vendor = make_vendor()
    dal = make_offering(vendor, name="Dal", total=10)
    roti = make_offering(vendor, name="Roti", total=6)
    customers = [make_user(Role.customer) for _ in range(5)]
    results = _race(db, customers, [dal.id, roti.id], qty=2, total_threads=12)
    assert not [r for r in results if r.startswith("boom")], results
    assert results.count("ok") == 3
    db.expire_all()
    assert (db.get(MenuOffering, dal.id).portions_sold, db.get(MenuOffering, roti.id).portions_sold) == (6, 6)


def test_racing_cancel_and_buy_never_oversells(db, clk, make_vendor, make_offering, make_user):
    """Buyers keep ordering while earlier orders are cancelled; sold always equals the sum of live order quantities."""
    vendor = make_vendor()
    o = make_offering(vendor, total=4)
    c = make_user(Role.customer)
    first = [order_service.place_order(db, c, OrderIn(items=[{"offering_id": o.id, "qty": 1}], fulfilment="pickup"), clk.current)
             for _ in range(4)]
    engine = make_engine(db.get_bind().url.render_as_string(hide_password=False))
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    barrier = threading.Barrier(8)
    out: list[str] = []

    def canceller(order_id):
        s = Session()
        barrier.wait(timeout=10)
        try:
            order_service.cancel_by_customer(s, s.get(Order, order_id), clk.current, None)
            out.append("cancelled")
        finally:
            s.close()

    def buyer():
        s = Session()
        barrier.wait(timeout=10)
        try:
            order_service.place_order(s, s.get(type(c), c.id), OrderIn(items=[{"offering_id": o.id, "qty": 1}], fulfilment="pickup"), clk.current)
            out.append("bought")
        except order_service.OrderError:
            out.append("refused")
        finally:
            s.close()

    ts = [threading.Thread(target=canceller, args=(od.id,)) for od in first[:4]] + [threading.Thread(target=buyer) for _ in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(timeout=60)
    engine.dispose()
    db.expire_all()
    live_qty = db.scalar(select(func.coalesce(func.sum(OrderItem.qty), 0)).join(Order).where(Order.status != OrderStatus.cancelled))
    sold = db.get(MenuOffering, o.id).portions_sold
    assert sold == live_qty <= 4
    assert len(out) == 8
