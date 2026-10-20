import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Role, User


def test_phone_role_unique(db):
    db.add(User(role=Role.customer, phone="+919876500001", name="a"))
    db.add(User(role=Role.vendor, phone="+919876500001", name="b"))
    db.commit()
    db.add(User(role=Role.customer, phone="+919876500001", name="c"))
    with pytest.raises(IntegrityError):
        db.commit()
