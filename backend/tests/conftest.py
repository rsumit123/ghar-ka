"""Shared fixtures: temp SQLite DB (create_all), TestClient, captured SMS, user helpers.

Available to all tests: `db` (Session), `client` (TestClient with cookies), `sms` (FakeSms with .last_code(phone)),
`make_user(role, **fields)`, `login_as(user)` (sets session cookie on `client`).
"""
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="gharka-test-")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/import.db"
os.environ["ENV"] = "dev"

import re  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.config import get_settings  # noqa: E402
from app.db import Base, get_db, make_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.services.sessions import create_session  # noqa: E402
from app.services.sms import get_sms_provider  # noqa: E402


class FakeSms:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    def send(self, phone: str, message: str) -> None:
        self.messages.append((phone, message))

    def last_code(self, phone: str) -> str:
        for p, m in reversed(self.messages):
            if p == phone:
                return re.search(r"\b(\d{6})\b", m).group(1)
        raise AssertionError(f"no SMS sent to {phone}")


@pytest.fixture
def db(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def sms() -> FakeSms:
    return FakeSms()


@pytest.fixture
def client(db: Session, sms: FakeSms):
    def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_sms_provider] = lambda: sms
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db: Session):
    counter = iter(range(1, 10_000))

    def make(role: Role = Role.customer, **fields) -> User:
        n = next(counter)
        fields.setdefault("name", f"{role.value} {n}")
        if role == Role.admin:
            fields.setdefault("email", f"admin{n}@example.com")
        else:
            fields.setdefault("phone", f"+9198765{n:05d}")
        user = User(role=role, **fields)
        db.add(user)
        db.commit()
        return user

    return make


@pytest.fixture
def login_as(client: TestClient, db: Session):
    def login(user: User) -> None:
        client.cookies.set(get_settings().COOKIE_NAME, create_session(db, user))

    return login


# ---- Phase 3 helpers: frozen clock, live vendors, offerings -------------------------------------------------------
from datetime import UTC, date, datetime, timedelta  # noqa: E402

from app.models import (  # noqa: E402
    Diet, FssaiRecord, FssaiStatus, Locality, MenuOffering, ReviewStatus, Slot, Vendor,
)
from app.services import clock  # noqa: E402

# 08:00 on Tuesday 20 Oct 2026 in Asia/Kolkata (UTC+5:30)
FROZEN_NOW = datetime(2026, 10, 20, 2, 30, tzinfo=UTC)
TODAY = date(2026, 10, 20)


class FakeClock:
    def __init__(self) -> None:
        self.current = FROZEN_NOW

    def set(self, dt: datetime) -> None:
        self.current = dt

    def advance(self, **kw) -> None:
        self.current += timedelta(**kw)


@pytest.fixture
def clk(monkeypatch) -> FakeClock:
    """Frozen clock at 08:00 IST on 2026-10-20. `clk.set(...)` / `clk.advance(minutes=5)` to move it."""
    c = FakeClock()
    monkeypatch.setattr(clock, "now", lambda: c.current)
    return c


@pytest.fixture
def make_vendor(db: Session, make_user):
    def make(*, live: bool = True, name: str = "Asha", lat: float | None = 12.9716, lng: float | None = 77.5946,
             pincode: str | None = "560001", locality_id: int | None = None, offers_pickup: bool = True,
             delivery_radius_km: float = 3.0, review_status: ReviewStatus | None = None, **fields) -> Vendor:
        user = make_user(Role.vendor, name=name)
        v = Vendor(
            user_id=user.id, display_name=name, story="Dal chawal like home", lat=lat, lng=lng, pincode=pincode,
            locality_id=locality_id, offers_pickup=offers_pickup, delivery_radius_km=delivery_radius_km,
            whatsapp_phone=user.phone, address_line="12 Tulsi Lane",
            review_status=review_status or (ReviewStatus.approved if live else ReviewStatus.pending), **fields,
        )
        v.fssai = FssaiRecord(
            status=FssaiStatus.registration_issued if live else FssaiStatus.docs_pending,
            expiry_date=date(2027, 12, 31) if live else None,
            registration_number="123" if live else None, issue_date=date(2026, 1, 1) if live else None,
        )
        db.add(v)
        db.commit()
        v.user = user  # convenience for tests
        return v

    return make


@pytest.fixture
def make_locality(db: Session):
    def make(name="Indiranagar", pincode="560001", lat=12.9716, lng=77.5946, city="Bengaluru") -> Locality:
        loc = Locality(name=name, city=city, pincode=pincode, lat=lat, lng=lng)
        db.add(loc)
        db.commit()
        return loc

    return make


@pytest.fixture
def make_offering(db: Session):
    def make(vendor: Vendor, day: date = TODAY, slot: Slot = Slot.lunch, *, name: str = "Dal Rice", price: int = 8000,
             total: int = 10, sold: int = 0, diet: Diet = Diet.veg, preset: str | None = "2h",
             cutoff: datetime | None = None) -> MenuOffering:
        o = MenuOffering(
            vendor_id=vendor.id, date=day, slot=slot, dish_name=name, price=price, portions_total=total,
            portions_sold=sold, diet=diet, cutoff_at=cutoff or clock.cutoff_for(day, slot, preset),
        )
        db.add(o)
        db.commit()
        return o

    return make
