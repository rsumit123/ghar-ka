"""Menu offerings: state (open/closed), serialisation, create/copy helpers."""
from datetime import date, datetime, timedelta

from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.models import MenuOffering, Slot, Vendor
from app.services import clock
from app.services.clock import at_local, tz

MAX_DATES_PER_REQUEST = 14
MAX_DAYS_AHEAD = 30


SLOT_ORDER = {Slot.lunch: 0, Slot.dinner: 1}


def slot_rank(column):
    """ORDER BY expression: lunch before dinner (alphabetical order would put dinner first)."""
    return case((column == Slot.lunch.value, 0), else_=1)


class MenuError(ValueError):
    def __init__(self, detail: str, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def portions_left(o: MenuOffering) -> int:
    return max(o.portions_total - o.portions_sold, 0)


def is_open(o: MenuOffering, at: datetime) -> bool:
    """Open = before cutoff and not sold out."""
    return o.cutoff_at > at and o.portions_sold < o.portions_total


def offering_public(o: MenuOffering, at: datetime) -> dict:
    return {
        "id": o.id, "date": o.date, "slot": o.slot, "dish_name": o.dish_name, "description": o.description,
        "photo": o.photo_path, "price": o.price, "diet": o.diet, "portions_left": portions_left(o),
        "cutoff_at": o.cutoff_at, "is_open": is_open(o, at),
    }


def offering_vendor(o: MenuOffering, at: datetime) -> dict:
    d = offering_public(o, at)
    d.update(portions_total=o.portions_total, portions_sold=o.portions_sold, created_at=o.created_at)
    return d


def validate_new_date(d: date) -> None:
    today = clock.local_today()
    if d < today:
        raise MenuError("That date has already passed")
    if d > today + timedelta(days=MAX_DAYS_AHEAD):
        raise MenuError(f"You can plan up to {MAX_DAYS_AHEAD} days ahead")


def ensure_cutoff_in_future(cutoff: datetime, d: date) -> None:
    if cutoff <= clock.now():
        raise MenuError(f"The order-by time for {d.strftime('%d %b')} has already passed. Pick a later time.")


def shift_cutoff(src_date: date, src_cutoff: datetime, dst_date: date) -> datetime:
    """Same local time of day, same number of days before the meal as the source offering."""
    local = src_cutoff.astimezone(tz())
    days_before = (src_date - local.date()).days
    return at_local(dst_date - timedelta(days=days_before), local.time())


def copy_offerings(db: Session, vendor: Vendor, from_date: date, to_dates: list[date], slot: Slot | None) -> dict:
    """Copy a day's dishes to other dates (sold reset to 0). Existing same-name dishes in the target slot are skipped.

    Returns {"created": [MenuOffering], "skipped": n}. Caller commits.
    """
    if not to_dates:
        raise MenuError("Choose at least one day to copy to")
    if len(to_dates) > MAX_DATES_PER_REQUEST:
        raise MenuError(f"Pick at most {MAX_DATES_PER_REQUEST} days at a time")
    q = select(MenuOffering).where(MenuOffering.vendor_id == vendor.id, MenuOffering.date == from_date)
    if slot is not None:
        q = q.where(MenuOffering.slot == slot)
    sources = list(db.scalars(q.order_by(MenuOffering.id)))
    if not sources:
        raise MenuError("There is no menu on that day to copy", 404)
    created: list[MenuOffering] = []
    skipped = 0
    now = clock.now()
    for to in sorted(set(to_dates)):
        validate_new_date(to)
        existing = {
            (o.slot, o.dish_name.lower())
            for o in db.scalars(select(MenuOffering).where(MenuOffering.vendor_id == vendor.id, MenuOffering.date == to))
        }
        for src in sources:
            cutoff = shift_cutoff(src.date, src.cutoff_at, to)
            if to == from_date or (src.slot, src.dish_name.lower()) in existing or cutoff <= now:
                skipped += 1
                continue
            o = MenuOffering(
                vendor_id=vendor.id, date=to, slot=src.slot, dish_name=src.dish_name, description=src.description,
                photo_path=src.photo_path, price=src.price, diet=src.diet, portions_total=src.portions_total,
                portions_sold=0, cutoff_at=cutoff,
            )
            db.add(o)
            created.append(o)
    return {"created": created, "skipped": skipped}
