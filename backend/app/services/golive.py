"""The go-live rule. `is_vendor_live` (Python) and `live_vendor_filter` (SQL) must always agree.

live = not suspended AND ((approved AND fssai registration_issued AND (no expiry OR expiry >= today)) OR live_override)
"""
from datetime import date

from sqlalchemy import ColumnElement, and_, exists, or_, select

from app.models import FssaiRecord, FssaiStatus, ReviewStatus, Vendor


def is_vendor_live(vendor: Vendor, fssai: FssaiRecord | None, today: date) -> bool:
    if vendor.review_status == ReviewStatus.suspended:
        return False
    fssai_ok = (
        fssai is not None
        and fssai.status == FssaiStatus.registration_issued
        and (fssai.expiry_date is None or fssai.expiry_date >= today)
    )
    return bool((vendor.review_status == ReviewStatus.approved and fssai_ok) or vendor.live_override)


def live_vendor_filter(today: date) -> ColumnElement[bool]:
    """WHERE-clause for queries on Vendor (no join needed): `select(Vendor).where(live_vendor_filter(today))`."""
    fssai_ok = exists(
        select(FssaiRecord.id).where(
            FssaiRecord.vendor_id == Vendor.id,
            FssaiRecord.status == FssaiStatus.registration_issued,
            or_(FssaiRecord.expiry_date.is_(None), FssaiRecord.expiry_date >= today),
        )
    )
    return and_(
        Vendor.review_status != ReviewStatus.suspended,
        or_(and_(Vendor.review_status == ReviewStatus.approved, fssai_ok), Vendor.live_override.is_(True)),
    )
