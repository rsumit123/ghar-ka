import itertools
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import FssaiRecord, FssaiStatus, ReviewStatus, Role, Vendor
from app.services.golive import is_vendor_live, live_vendor_filter

TODAY = date(2026, 10, 20)
EXPIRIES = [None, TODAY - timedelta(days=1), TODAY, TODAY + timedelta(days=30)]


def expected(review, fssai_status, expiry, override):
    if review == ReviewStatus.suspended:
        return False
    ok = review == ReviewStatus.approved and fssai_status == FssaiStatus.registration_issued and (expiry is None or expiry >= TODAY)
    return ok or override


def mk(review, fssai_status, expiry, override):
    v = Vendor(display_name="x", review_status=review, live_override=override)
    f = None if fssai_status is None else FssaiRecord(status=fssai_status, expiry_date=expiry)
    return v, f


@pytest.mark.parametrize("override", [False, True])
@pytest.mark.parametrize("expiry", EXPIRIES)
@pytest.mark.parametrize("fssai_status", [None, *FssaiStatus])
@pytest.mark.parametrize("review", list(ReviewStatus))
def test_rule_matrix(review, fssai_status, expiry, override):
    v, f = mk(review, fssai_status, expiry, override)
    assert is_vendor_live(v, f, TODAY) is expected(review, fssai_status, expiry, override)


def test_known_cases():
    v, f = mk(ReviewStatus.approved, FssaiStatus.registration_issued, TODAY, False)
    assert is_vendor_live(v, f, TODAY)  # expires today still valid
    assert not is_vendor_live(v, f, TODAY + timedelta(days=1))
    v.review_status = ReviewStatus.suspended
    v.live_override = True
    assert not is_vendor_live(v, f, TODAY)  # suspension beats override
    v, f = mk(ReviewStatus.pending, FssaiStatus.docs_pending, None, True)
    assert is_vendor_live(v, f, TODAY)  # override alone makes live


def test_sql_filter_agrees_with_python(db, make_user):
    combos = list(itertools.product(ReviewStatus, [None, *FssaiStatus], EXPIRIES, [False, True]))
    ids = {}
    for review, fs, exp, ov in combos:
        user = make_user(Role.vendor)
        v = Vendor(user_id=user.id, display_name="v", review_status=review, live_override=ov)
        if fs is not None:
            v.fssai = FssaiRecord(status=fs, expiry_date=exp)
        db.add(v)
        db.flush()
        ids[v.id] = (v, v.fssai)
    db.commit()
    live_sql = set(db.scalars(select(Vendor.id).where(live_vendor_filter(TODAY))))
    live_py = {vid for vid, (v, f) in ids.items() if is_vendor_live(v, f, TODAY)}
    assert len(ids) == len(combos) and live_py and live_py != set(ids)
    assert live_sql == live_py
