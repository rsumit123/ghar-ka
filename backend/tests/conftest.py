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
