"""Vendor menu management (offerings). Non-live vendors may prepare menus; only live vendors are listed publicly."""
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.deps import DbDep, require_role, require_xhr_header
from app.models import MenuOffering, Order, OrderItem, OrderStatus, Role, Slot, User, Vendor
from app.schemas.order import CopyIn, OfferingIn, OfferingUpdate
from app.services import clock, images, menu
from app.services.vendors import get_vendor_for_user

router = APIRouter(prefix="/vendor/offerings", tags=["vendor-menu"])
VendorUser = Annotated[User, Depends(require_role(Role.vendor))]


def _vendor(db: Session, user: User) -> Vendor:
    vendor = get_vendor_for_user(db, user.id)
    if vendor is None:
        raise HTTPException(404, "Finish setting up your kitchen first")
    return vendor


def _own_offering(db: Session, vendor: Vendor, offering_id: int) -> MenuOffering:
    o = db.get(MenuOffering, offering_id)
    if o is None or o.vendor_id != vendor.id:
        raise HTTPException(404, "Dish not found")
    return o


def _cutoff(d: date, slot, preset: str | None, cutoff_time: str | None):
    try:
        return clock.cutoff_for(d, slot, preset, cutoff_time)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None


def _release_photo(db: Session, path: str | None, *, exclude_id: int) -> None:
    """Delete a dish photo file unless another offering (e.g. a copied day) still uses it. Call after commit."""
    if not path:
        return
    still_used = db.scalar(select(func.count()).select_from(MenuOffering).where(
        MenuOffering.photo_path == path, MenuOffering.id != exclude_id))
    if not still_used:
        images.delete_stored(path, False)


@router.get("/cutoffs")
def cutoffs(user: VendorUser, slot: Slot, days: int = Query(7, ge=1, le=menu.MAX_DAYS_AHEAD + 1)):
    """Order-by time per day and preset, so the add-dish form can show "closes 10:30 am" and grey out closed days.
    `null` = that preset doesn't work for that meal (e.g. after it starts); `open` = still in the future."""
    now, today = clock.now(), clock.local_today()
    out = []
    for i in range(days):
        d = today + timedelta(days=i)
        row = {"date": d, "presets": {}}
        for preset in ("2h", "1h", "night_before_9pm", "morning_10am"):
            try:
                at = clock.cutoff_for(d, slot, preset)
            except ValueError:
                row["presets"][preset] = None
                continue
            row["presets"][preset] = {"cutoff_at": at, "open": at > now}
        out.append(row)
    return out


@router.get("/recent")
def recent_dishes(user: VendorUser, db: DbDep, limit: int = Query(12, ge=1, le=30)):
    """The cook's past dishes, newest first, one per name, so the add-dish form can refill them in one tap."""
    vendor = _vendor(db, user)
    rows = db.scalars(
        select(MenuOffering).where(MenuOffering.vendor_id == vendor.id)
        .order_by(MenuOffering.date.desc(), MenuOffering.id.desc()).limit(500)
    ).all()
    seen: dict[str, dict] = {}
    for o in rows:
        key = " ".join(o.dish_name.lower().split())
        if key in seen:
            seen[key]["times"] += 1
            if not seen[key]["photo"] and o.photo_path:  # newest day had no photo: fall back to an older day's
                seen[key].update(photo=o.photo_path, photo_from=o.id)
            continue
        if len(seen) < limit:
            seen[key] = {"offering_id": o.id, "dish_name": o.dish_name, "price": o.price, "diet": o.diet,
                         "portions_total": o.portions_total, "slot": o.slot, "photo": o.photo_path,
                         "photo_from": o.id if o.photo_path else None, "times": 1}
    return list(seen.values())


@router.get("")
def list_offerings(
    user: VendorUser, db: DbDep, date_from: date | None = None, date_to: date | None = None,
):
    vendor = _vendor(db, user)
    today = clock.local_today()
    date_from = date_from or today
    date_to = date_to or date_from + timedelta(days=6)
    if date_to < date_from or (date_to - date_from).days > 62:
        raise HTTPException(422, "Choose a date range of up to two months")
    rows = db.scalars(
        select(MenuOffering)
        .where(MenuOffering.vendor_id == vendor.id, MenuOffering.date >= date_from, MenuOffering.date <= date_to)
        .order_by(MenuOffering.date, menu.slot_rank(MenuOffering.slot), MenuOffering.id)
    ).all()
    now = clock.now()
    return [menu.offering_vendor(o, now) for o in rows]


@router.post("", status_code=201)
def create_offerings(body: OfferingIn, user: VendorUser, db: DbDep):
    """One dish for one or more dates. All-or-nothing: if any date is invalid nothing is created."""
    vendor = _vendor(db, user)
    photo = _own_offering(db, vendor, body.photo_from).photo_path if body.photo_from else None
    created: list[MenuOffering] = []
    for d in sorted(set(body.dates)):
        try:
            menu.validate_new_date(d)
            cutoff = _cutoff(d, body.slot, body.cutoff_preset, body.cutoff_time)
            menu.ensure_cutoff_in_future(cutoff, d)
        except menu.MenuError as e:
            raise HTTPException(e.status_code, e.detail) from None
        o = MenuOffering(
            vendor_id=vendor.id, date=d, slot=body.slot, dish_name=body.dish_name, description=body.description,
            price=body.price, diet=body.diet, portions_total=body.portions_total, portions_sold=0, cutoff_at=cutoff,
            photo_path=photo,
        )
        db.add(o)
        created.append(o)
    db.commit()
    now = clock.now()
    return [menu.offering_vendor(o, now) for o in created]


@router.post("/copy")
def copy_menu(body: CopyIn, user: VendorUser, db: DbDep):
    vendor = _vendor(db, user)
    try:
        result = menu.copy_offerings(db, vendor, body.from_date, body.to_dates, body.slot)
    except menu.MenuError as e:
        db.rollback()
        raise HTTPException(e.status_code, e.detail) from None
    db.commit()
    now = clock.now()
    return {"created": [menu.offering_vendor(o, now) for o in result["created"]], "skipped": result["skipped"]}


@router.put("/{offering_id}")
def update_offering(offering_id: int, body: OfferingUpdate, user: VendorUser, db: DbDep):
    vendor = _vendor(db, user)
    o = _own_offering(db, vendor, offering_id)
    if (body.slot is not None and body.slot != o.slot) or (body.date is not None and body.date != o.date):
        raise HTTPException(422, "A dish can't be moved to another day or meal. Add it again for that day.")
    data = body.model_dump(exclude_unset=True, exclude={"slot", "date", "portions_total", "cutoff_preset", "cutoff_time"})
    for key, val in data.items():
        if val is None and key in ("dish_name", "price", "diet"):
            continue
        setattr(o, key, val)
    if body.cutoff_preset or body.cutoff_time:
        cutoff = _cutoff(o.date, o.slot, body.cutoff_preset, body.cutoff_time)
        o.cutoff_at = cutoff
    if body.portions_total is not None:
        # Atomic against concurrent orders: only applies while total >= what is already sold.
        res = db.execute(
            update(MenuOffering)
            .where(MenuOffering.id == o.id, MenuOffering.portions_sold <= body.portions_total)
            .values(portions_total=body.portions_total)
            .execution_options(synchronize_session=False)
        )
        if res.rowcount != 1:
            db.rollback()
            sold = db.scalar(select(MenuOffering.portions_sold).where(MenuOffering.id == offering_id))
            raise HTTPException(409, f"{sold} portions are already sold, so you can't go below {sold}.")
    db.commit()
    db.refresh(o)
    return menu.offering_vendor(o, clock.now())


@router.delete("/{offering_id}", status_code=204)
def delete_offering(offering_id: int, user: VendorUser, db: DbDep):
    """Delete a dish nobody has ordered. If orders exist (not cancelled) respond 409 and tell the cook to close it instead
    (PUT portions_total = portions_sold), so customers' orders and the sold counter stay intact."""
    vendor = _vendor(db, user)
    o = _own_offering(db, vendor, offering_id)
    live_orders = db.scalar(
        select(func.count()).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.offering_id == o.id, Order.status != OrderStatus.cancelled)
    )
    if live_orders or o.portions_sold > 0:
        raise HTTPException(
            409,
            f"{live_orders or o.portions_sold} order(s) already include this dish, so it can't be deleted. "
            "Close it instead (set portions to the number sold).",
        )
    photo = o.photo_path
    # Conditional delete: a concurrent order between the check and here makes this a no-op.
    res = db.execute(delete(MenuOffering).where(MenuOffering.id == o.id, MenuOffering.portions_sold == 0)
                     .execution_options(synchronize_session=False))
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Someone just ordered this dish, so it can't be deleted. Close it instead.")
    db.commit()
    _release_photo(db, photo, exclude_id=offering_id)


@router.post("/{offering_id}/photo", dependencies=[Depends(require_xhr_header)])
def upload_photo(
    offering_id: int, user: VendorUser, db: DbDep, file: UploadFile, also: Annotated[str, Form()] = "",
):
    """`also`: comma-separated ids of the same dish on other days; they share the one stored file."""
    vendor = _vendor(db, user)
    try:
        extra = {int(x) for x in also.split(",") if x.strip()} - {offering_id}
    except ValueError:
        raise HTTPException(422, "also must be offering ids") from None
    targets = [_own_offering(db, vendor, offering_id)] + [_own_offering(db, vendor, i) for i in sorted(extra)]
    try:
        stored = images.save_upload(file.file, subdir=f"v{vendor.id}", private=False)
    except images.UploadError as e:
        raise HTTPException(e.status_code, e.detail) from None
    old = {o.photo_path for o in targets}
    for o in targets:
        o.photo_path = stored.path
    db.commit()
    for path in old:  # every target now points at the new file, so excluding any one of them is enough
        _release_photo(db, path, exclude_id=targets[0].id)
    return menu.offering_vendor(targets[0], clock.now())
