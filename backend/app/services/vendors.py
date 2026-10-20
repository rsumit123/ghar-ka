"""Vendor profile helpers shared by the vendor and admin routers."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FssaiRecord, FssaiStatus, Locality, MediaKind, Vendor, VendorMedia
from app.services.audit import write_audit
from app.services.clock import local_today
from app.services.golive import is_vendor_live

PRIVATE_DOC_KINDS = (MediaKind.id_proof, MediaKind.address_proof, MediaKind.passport_photo)
MAX_KITCHEN_PHOTOS = 6


def get_vendor_for_user(db: Session, user_id: int) -> Vendor | None:
    return db.scalar(select(Vendor).where(Vendor.user_id == user_id))


def present_kinds(vendor: Vendor) -> set[MediaKind]:
    return {m.kind for m in vendor.media}


def missing_docs(vendor: Vendor) -> list[MediaKind]:
    have = present_kinds(vendor)
    return [k for k in PRIVATE_DOC_KINDS if k not in have]


def vendor_is_live(vendor: Vendor) -> bool:
    return is_vendor_live(vendor, vendor.fssai, local_today())


def media_out(m: VendorMedia, *, include_private_path: bool = False) -> dict:
    return {
        "id": m.id, "kind": m.kind, "is_private": m.is_private,
        "path": None if (m.is_private and not include_private_path) else m.path,
        "is_pdf": m.path.lower().endswith(".pdf"), "created_at": m.created_at,
    }


def advance_docs_if_complete(db: Session, vendor: Vendor, actor_id: int | None) -> bool:
    """docs_pending -> docs_received once all three private docs exist. Caller commits."""
    f = vendor.fssai
    if f is not None and f.status == FssaiStatus.docs_pending and not missing_docs(vendor):
        f.status = FssaiStatus.docs_received
        write_audit(db, actor_id, "fssai.docs_received", "vendor", vendor.id,
                    {"before": {"status": "docs_pending"}, "after": {"status": "docs_received"}, "auto": True})
        return True
    return False


def locality_name(db: Session, vendor: Vendor) -> str | None:
    if vendor.locality_id is None:
        return None
    loc = db.get(Locality, vendor.locality_id)
    return loc.name if loc else None


def new_fssai() -> FssaiRecord:
    return FssaiRecord(status=FssaiStatus.docs_pending)
