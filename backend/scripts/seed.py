"""Demo data for local development and screenshots.

    cd backend
    uv run python scripts/seed.py                 # seed an empty database (no-op if already seeded)
    uv run python scripts/seed.py --reset         # wipe ALL data + uploads, then seed
    uv run python scripts/seed.py --admin-password 'something-long'

Refuses to run when ENV=prod unless --force. Dates are relative to "today" (APP_TIMEZONE), so re-seed after a few days
to get fresh menus. Apply migrations first: `uv run alembic upgrade head`.
"""
import argparse
import io
import random
import secrets
import shutil
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402
from sqlalchemy import delete, func, select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import Base, SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Complaint, ComplaintStatus, Diet, Fulfilment, FssaiRecord, FssaiStatus, Locality, MediaKind, MenuOffering, Order,
    OrderItem, OrderStatus, PaymentMethod, PaymentStatus, Review, ReviewStatus, Role, Slot, Subscription,
    SubscriptionSkip, SubscriptionStatus, TiffinPlan, User, Vendor, VendorMedia,
)
from app.services import clock  # noqa: E402
from app.services.audit import write_audit  # noqa: E402
from app.services.images import save_upload, upload_root  # noqa: E402
from app.services.security import hash_password  # noqa: E402
from app.services.subscriptions import materialize_subscription_orders  # noqa: E402

rng = random.Random(7)

# --------------------------------------------------------------------------------------------- placeholder images

PALETTES = [  # (wall, accent, plate)
    ((244, 214, 160), (194, 96, 62), (250, 244, 232)),
    ((226, 196, 150), (79, 121, 66), (246, 238, 222)),
    ((240, 205, 170), (227, 160, 8), (252, 247, 238)),
    ((214, 190, 160), (160, 70, 50), (248, 240, 226)),
    ((232, 208, 168), (110, 140, 80), (250, 244, 230)),
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _grain(img: Image.Image, amount: int = 14) -> Image.Image:
    noise = Image.effect_noise(img.size, amount).convert("RGB")
    return Image.blend(img, noise, 0.06).filter(ImageFilter.GaussianBlur(0.4))


def _png(img: Image.Image) -> io.BytesIO:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def avatar_image(name: str, seed: int, size: int = 600) -> Image.Image:
    wall, accent, _ = PALETTES[seed % len(PALETTES)]
    img = Image.new("RGB", (size, size), accent)
    d = ImageDraw.Draw(img)
    for i in range(0, size, 60):  # soft diagonal stripes, like a block-printed cloth
        d.polygon([(i, 0), (i + 28, 0), (i + 28 - size, size), (i - size, size)], fill=tuple(min(255, c + 14) for c in accent))
    d.ellipse([size * .14, size * .14, size * .86, size * .86], fill=wall, outline=(43, 33, 24), width=8)
    initials = "".join(w[0] for w in name.split()[:2]).upper()
    font = _font(int(size * .34))
    box = d.textbbox((0, 0), initials, font=font)
    d.text(((size - (box[2] - box[0])) / 2 - box[0], (size - (box[3] - box[1])) / 2 - box[1]), initials, font=font, fill=(43, 33, 24))
    d.ellipse([size * .40, size * .06, size * .60, size * .16], fill=(227, 160, 8))  # a bindi-ish dot
    return _grain(img)


def kitchen_image(seed: int, w: int = 1200, h: int = 800) -> Image.Image:
    wall, accent, plate = PALETTES[seed % len(PALETTES)]
    r = random.Random(seed)
    img = Image.new("RGB", (w, h), wall)
    d = ImageDraw.Draw(img)
    for y in range(0, int(h * .5), 6):  # wall gradient
        shade = int(y / (h * .5) * 22)
        d.rectangle([0, y, w, y + 6], fill=tuple(max(0, c - shade) for c in wall))
    tile = 60
    for ty in range(int(h * .22), int(h * .55), tile):  # tiled backsplash
        for tx in range(0, w, tile):
            ok = ((tx // tile) + (ty // tile)) % 2 == 0
            d.rectangle([tx, ty, tx + tile - 3, ty + tile - 3], fill=(250, 244, 232) if ok else (236, 224, 200))
    d.rectangle([0, 0, w, int(h * .12)], fill=tuple(max(0, c - 40) for c in wall))
    for i in range(7):  # hanging utensils
        x = 90 + i * 160
        d.line([x, int(h * .12), x, int(h * .3)], fill=(90, 70, 50), width=5)
        d.ellipse([x - 22, int(h * .3), x + 22, int(h * .3) + 44], outline=(120, 110, 100), width=6)
    counter = int(h * .6)
    d.rectangle([0, counter, w, h], fill=(150, 104, 66))
    for y in range(counter, h, 18):
        d.line([0, y, w, y + r.randint(-4, 4)], fill=(132, 90, 56), width=2)
    x = 70
    while x < w - 200:  # pots and a thali on the counter
        pw = r.randint(150, 240)
        ph = r.randint(110, 170)
        col = r.choice([(176, 176, 182), (190, 186, 176), accent])
        d.rounded_rectangle([x, counter - ph, x + pw, counter], radius=18, fill=col, outline=(60, 50, 40), width=5)
        d.rounded_rectangle([x - 6, counter - ph - 18, x + pw + 6, counter - ph + 8], radius=10, fill=tuple(max(0, c - 25) for c in col))
        d.ellipse([x + pw / 2 - 14, counter - ph - 36, x + pw / 2 + 14, counter - ph - 14], fill=(60, 50, 40))
        x += pw + r.randint(30, 70)
    cx, cy = int(w * .78), int(h * .82)
    d.ellipse([cx - 150, cy - 70, cx + 150, cy + 70], fill=plate, outline=(60, 50, 40), width=5)
    for k in range(5):
        a = k * 1.25
        px, py = cx + 80 * (0.9 if k % 2 else 0.5) * (1 if k < 3 else -1) * 0.8, cy + 28 * (-1 if k % 2 else 1)
        d.ellipse([px - 30, py - 20, px + 30, py + 20], fill=r.choice([(227, 160, 8), (194, 96, 62), (79, 121, 66), (240, 220, 160)]))
    vignette = Image.new("L", (w, h), 0)
    ImageDraw.Draw(vignette).ellipse([-w * .2, -h * .2, w * 1.2, h * 1.2], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    img = Image.composite(img, Image.new("RGB", (w, h), (60, 40, 30)), vignette)
    return _grain(img)


def dish_image(seed: int, size: int = 700) -> Image.Image:
    r = random.Random(seed)
    img = Image.new("RGB", (size, size), (160, 112, 72))
    d = ImageDraw.Draw(img)
    for y in range(0, size, 22):
        d.line([0, y, size, y + r.randint(-5, 5)], fill=(140, 96, 60), width=3)
    c = size // 2
    d.ellipse([c - 290, c - 290, c + 290, c + 290], fill=(250, 244, 232), outline=(70, 55, 40), width=6)
    d.ellipse([c - 235, c - 235, c + 235, c + 235], outline=(227, 190, 120), width=6)
    colours = [(227, 160, 8), (194, 96, 62), (79, 121, 66), (240, 226, 190), (150, 70, 40), (250, 250, 240)]
    for _ in range(6):  # katoris / portions
        px, py, rad = c + r.randint(-150, 150), c + r.randint(-150, 150), r.randint(55, 90)
        d.ellipse([px - rad, py - rad, px + rad, py + rad], fill=r.choice(colours), outline=(70, 55, 40), width=4)
        d.ellipse([px - rad * .5, py - rad * .5, px + rad * .5, py + rad * .5], fill=r.choice(colours))
    return _grain(img)


def doc_image(label: str, seed: int) -> Image.Image:
    img = Image.new("RGB", (900, 600), (245, 242, 234))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 880, 580], outline=(120, 110, 100), width=4)
    d.text((50, 50), f"SAMPLE {label.upper()}", font=_font(44), fill=(90, 80, 70))
    for i in range(6):
        d.rectangle([50, 150 + i * 50, 400 + (i * 97 + seed * 31) % 400, 170 + i * 50], fill=(205, 198, 186))
    d.text((50, 520), "Placeholder generated by seed.py - not a real document", font=_font(22), fill=(150, 90, 80))
    return img


# ----------------------------------------------------------------------------------------------------------- data

LOCALITIES = [  # real Bengaluru neighbourhoods, approximate centres
    ("Indiranagar", "560038", 12.9784, 77.6408),
    ("Domlur", "560071", 12.9610, 77.6387),
    ("CV Raman Nagar", "560093", 12.9855, 77.6636),
    ("Halasuru", "560008", 12.9810, 77.6200),
]

# name, phone, story, locality idx, lat, lng, address, fssai status, review status
VENDORS = [
    dict(name="Kamala Iyer", phone="+919820000001", loc=0, lat=12.9791, lng=77.6402, addr="14, 5th Cross, Indiranagar 1st Stage",
         story="Tamil-Brahmin home meals the way my paati made them: sambar ground fresh every morning.",
         fssai=FssaiStatus.registration_issued, review=ReviewStatus.approved, delivery=3.0, pickup=True, style="south"),
    dict(name="Sunita Verma", phone="+919820000002", loc=1, lat=12.9622, lng=77.6379, addr="Flat 202, Lakshmi Apartments, Domlur",
         story="Punjabi ghar ka khana: dal makhani on slow flame, phulkas hot off the tawa.",
         fssai=FssaiStatus.application_filed, review=ReviewStatus.approved, delivery=4.0, pickup=True, style="north"),
    dict(name="Farida Sheikh", phone="+919820000003", loc=3, lat=12.9818, lng=77.6212, addr="22, Church Street Lane, Halasuru",
         story="Hyderabadi dum biryani and haleem on weekends, made in small batches.",
         fssai=FssaiStatus.docs_received, review=ReviewStatus.pending, delivery=2.0, pickup=True, style="hyd"),
    dict(name="Meera Joshi", phone="+919820000004", loc=2, lat=12.9862, lng=77.6650, addr="7, Sri Sai Nilaya, CV Raman Nagar",
         story="Maharashtrian thali: varan bhaat, bharli vangi and soft puran poli on festival days.",
         fssai=FssaiStatus.docs_pending, review=ReviewStatus.pending, delivery=0.0, pickup=True, style="maha"),
    dict(name="Lakshmi Reddy", phone="+919820000005", loc=0, lat=12.9770, lng=77.6440, addr="31, 12th Main, Indiranagar",
         story="Andhra meals with gongura pickle and pappu charu.",
         fssai=FssaiStatus.rejected, review=ReviewStatus.rejected, delivery=2.0, pickup=True, style="andhra"),
]

MENUS = {  # style -> {slot: [(dish, description, price_rupees, diet)]}, several options rotate through the week
    "south": {
        "lunch": [("Full Meals", "Rice, sambar, rasam, two poriyals, kootu, curd, pappadam", 120, Diet.veg),
                  ("Curd Rice & Pickle", "Fresh curd rice tempered with mustard and curry leaves", 70, Diet.veg),
                  ("Bisibele Bath", "Hot spicy rice-lentil bath with ghee and boondi", 90, Diet.veg),
                  ("Lemon Rice with Vadai", "Tangy lemon rice, crisp medu vadai", 85, Diet.veg)],
        "dinner": [("Dosa Plate (3)", "Crisp dosas with coconut chutney and sambar", 90, Diet.veg),
                   ("Idli Vada Combo", "3 idlis, 1 vada, chutney, sambar", 80, Diet.veg),
                   ("Pongal & Gotsu", "Ven pongal with brinjal gotsu and ghee", 85, Diet.veg)],
    },
    "north": {
        "lunch": [("Rajma Chawal", "Slow-cooked rajma, jeera rice, onion salad", 110, Diet.veg),
                  ("Dal Makhani Thali", "Dal makhani, paneer sabzi, 3 phulkas, rice, raita", 160, Diet.veg),
                  ("Chole Kulche", "Amritsari chole with two stuffed kulchas", 100, Diet.veg),
                  ("Butter Chicken Meal", "Butter chicken, 2 rotis, jeera rice, salad", 190, Diet.nonveg)],
        "dinner": [("Roti Sabzi Combo", "4 phulkas, seasonal sabzi, dal tadka, salad", 120, Diet.veg),
                   ("Egg Curry & Paratha", "Dhaba-style egg curry with 2 laccha parathas", 130, Diet.egg),
                   ("Kadhi Pakoda Chawal", "Punjabi kadhi with pakodas and steamed rice", 105, Diet.veg)],
    },
}

DISH_NAMES_FALLBACK = ["Dal Rice", "Veg Thali", "Roti Sabzi", "Curd Rice"]
REVIEW_TEXTS = {
    5: ["Tastes exactly like home. The sambar was perfect.", "Hot, fresh and generous portions. Will order again!", "Aunty packed it so neatly. Lovely food.", "Best ghar ka khana in the area."],
    4: ["Very good food, delivery was a little late.", "Tasty and fresh. A bit less salt next time please.", "Good portions, great value."],
    3: ["Food was fine but arrived lukewarm.", "Okay meal; roti was a bit hard."],
}
CUSTOMERS = [  # name, phone, address
    ("Ravi Kumar", "+919810000001", "5, Park Road, Indiranagar"),
    ("Priya Nair", "+919810000002", "Flat 3B, Sunrise Apartments, Domlur"),
    ("Arjun Das", "+919810000003", "18, 2nd Main, CV Raman Nagar"),
    ("Meenal Shah", "+919810000004", "9, Double Road, Indiranagar"),
    ("Sanjay Rao", "+919810000005", "44, 80 Feet Road, Indiranagar"),
    ("Kavita Menon", "+919810000006", "Flat 12, Greenview, Halasuru"),
    ("Imran Pasha", "+919810000007", "6, 1st Cross, Domlur"),
    ("Ananya Gupta", "+919810000008", "27, 9th Main, Indiranagar"),
]


def utc_at(d: date, hh: int, mm: int = 0) -> datetime:
    return clock.at_local(d, time(hh, mm))


def wipe(db) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(delete(table))
    db.commit()
    for private in (False, True):
        root = upload_root(private)
        if root.exists():
            for child in root.iterdir():
                shutil.rmtree(child) if child.is_dir() else child.unlink()


def seed(db, admin_password: str) -> dict:
    today = clock.local_today()
    now = clock.now()
    localities = []
    for name, pin, lat, lng in LOCALITIES:
        loc = Locality(name=name, city="Bengaluru", pincode=pin, lat=lat, lng=lng)
        db.add(loc)
        localities.append(loc)
    db.flush()

    admin = User(role=Role.admin, email="admin@gharka.local", name="Admin", password_hash=hash_password(admin_password))
    db.add(admin)

    vendors: list[Vendor] = []
    for i, spec in enumerate(VENDORS):
        user = User(role=Role.vendor, phone=spec["phone"], name=spec["name"])
        db.add(user)
        db.flush()
        loc = localities[spec["loc"]]
        v = Vendor(
            user_id=user.id, display_name=spec["name"], story=spec["story"], locality_id=loc.id, pincode=loc.pincode,
            lat=spec["lat"], lng=spec["lng"], address_line=spec["addr"], whatsapp_phone=spec["phone"],
            review_status=spec["review"], offers_pickup=spec["pickup"], delivery_radius_km=spec["delivery"],
            created_at=now - timedelta(days=60 - i * 7),
            approved_at=(now - timedelta(days=50 - i * 5)) if spec["review"] == ReviewStatus.approved else None,
        )
        if spec["review"] == ReviewStatus.rejected:
            v.review_note = "Kitchen photos were too dark to verify and the address proof did not match. Please re-upload clearer photos."
        st = spec["fssai"]
        f = FssaiRecord(status=st, notes=None)
        if st == FssaiStatus.registration_issued:
            f.application_id, f.registration_number = "APP-2026-118842", "21226012000417"
            f.issue_date, f.expiry_date = today - timedelta(days=320), today + timedelta(days=45)  # expiring soon -> tracker highlight
            f.notes = "Renewal reminder sent to cook."
        elif st == FssaiStatus.application_filed:
            f.application_id = "APP-2026-224019"
            f.notes = "Filed 12 days ago on FoSCoS; portal says 'under scrutiny'."
        elif st == FssaiStatus.docs_received:
            f.notes = "ID + address proof received; photo pending review."
        elif st == FssaiStatus.rejected:
            f.application_id, f.notes = "APP-2026-100377", "Application returned: premises address mismatch."
        v.fssai = f
        if spec["name"] == "Sunita Verma":  # admin override keeps her live while the FSSAI application is processed
            v.live_override = True
            v.live_override_reason = "FSSAI application filed and acknowledged; allowed to cook while registration is processed."
        db.add(v)
        db.flush()
        if v.live_override:
            write_audit(db, admin.id, "vendor.override", "vendor", v.id,
                        {"enabled": True, "reason": v.live_override_reason})
        vendors.append(v)
        _add_media(db, v, i)
    db.flush()
    kamala, sunita = vendors[0], vendors[1]

    # ---- menus: next 7 days, lunch + dinner, for the two live cooks
    offerings: dict[tuple[int, date, Slot], list[MenuOffering]] = {}
    dish_seed = 100
    for v, spec in zip(vendors[:2], VENDORS[:2]):
        for offset in range(7):
            d = today + timedelta(days=offset)
            for slot in (Slot.lunch, Slot.dinner):
                options = MENUS[spec["style"]][slot.value]
                picks = [options[(offset + k) % len(options)] for k in range(2)]
                for k, (dish, desc, price, diet) in enumerate(picks):
                    preset = "night_before_9pm" if (slot == Slot.dinner and k == 1 and offset > 0) else "2h"
                    o = MenuOffering(
                        vendor_id=v.id, date=d, slot=slot, dish_name=dish, description=desc, price=price * 100, diet=diet,
                        portions_total=rng.choice([8, 10, 12, 15]), portions_sold=0, cutoff_at=clock.cutoff_for(d, slot, preset),
                        created_at=now - timedelta(hours=6),
                    )
                    if offset < 3 and k == 0:
                        dish_seed += 1
                        o.photo_path = _save(dish_image(dish_seed), f"v{v.id}")
                    db.add(o)
                    offerings.setdefault((v.id, d, slot), []).append(o)
    db.flush()

    # ---- tiffin plans
    plan_k = TiffinPlan(vendor_id=kamala.id, name="Weekday Lunch Tiffin", description="Rice, sambar/rasam, one poriyal and curd, Mon to Fri. Fresh every day.",
                        slot=Slot.lunch, days_of_week=[0, 1, 2, 3, 4], price_per_week=55000, diet=Diet.veg, cutoff_hours_before=12)
    plan_s = TiffinPlan(vendor_id=sunita.id, name="Roti-Sabzi Dinner (6 days)", description="4 phulkas, sabzi, dal and salad, Monday to Saturday.",
                        slot=Slot.dinner, days_of_week=[0, 1, 2, 3, 4, 5], price_per_week=72000, diet=Diet.veg, cutoff_hours_before=10)
    plan_off = TiffinPlan(vendor_id=sunita.id, name="Sunday Special (paused)", description="Rajma-chawal on Sundays.", slot=Slot.lunch,
                          days_of_week=[6], price_per_week=15000, diet=Diet.veg, active=False, cutoff_hours_before=12)
    db.add_all([plan_k, plan_s, plan_off])
    db.flush()

    # ---- customers
    customers: list[User] = []
    for i, (name, phone, addr) in enumerate(CUSTOMERS):
        loc = localities[i % 3]
        c = User(role=Role.customer, phone=phone, name=name, address_line=addr, pincode=loc.pincode,
                 lat=loc.lat + rng.uniform(-.004, .004), lng=loc.lng + rng.uniform(-.004, .004), created_at=now - timedelta(days=40))
        db.add(c)
        customers.append(c)
    db.flush()

    # ---- history: completed (with reviews), some cancelled
    history_items = {
        kamala.id: [("Full Meals", 12000), ("Curd Rice & Pickle", 7000), ("Dosa Plate (3)", 9000), ("Idli Vada Combo", 8000)],
        sunita.id: [("Rajma Chawal", 11000), ("Dal Makhani Thali", 16000), ("Roti Sabzi Combo", 12000), ("Chole Kulche", 10000)],
    }
    completed: list[Order] = []
    for back in range(1, 15):
        d = today - timedelta(days=back)
        for _ in range(rng.randint(2, 4)):
            v = rng.choice([kamala, kamala, sunita])
            c = rng.choice(customers)
            slot = rng.choice([Slot.lunch, Slot.dinner])
            dish, price = rng.choice(history_items[v.id])
            qty = rng.choice([1, 1, 2])
            cancelled = rng.random() < .12
            delivery = rng.random() < .4 and v.delivery_radius_km > 0
            o = Order(
                customer_id=c.id, vendor_id=v.id, date=d, slot=slot,
                status=OrderStatus.cancelled if cancelled else OrderStatus.completed,
                fulfilment=Fulfilment.delivery if delivery else Fulfilment.pickup,
                delivery_address=c.address_line if delivery else None, lat=c.lat if delivery else None, lng=c.lng if delivery else None,
                total=qty * price, payment_method=PaymentMethod.cod,
                payment_status=PaymentStatus.pending if cancelled else PaymentStatus.paid,
                cancel_reason="Cook was unwell today" if cancelled else None,
                created_at=utc_at(d, 8 if slot == Slot.lunch else 15, rng.randint(0, 59)),
                updated_at=utc_at(d, 13 if slot == Slot.lunch else 20, rng.randint(0, 59)),
                items=[OrderItem(name=dish, qty=qty, unit_price=price)],
            )
            db.add(o)
            if not cancelled:
                completed.append(o)
    db.flush()
    reviewed = []
    for o in completed:
        if rng.random() < .65:
            rating = rng.choices([5, 4, 3], weights=[6, 3, 1])[0]
            db.add(Review(order_id=o.id, customer_id=o.customer_id, vendor_id=o.vendor_id, rating=rating,
                          text=rng.choice(REVIEW_TEXTS[rating]), created_at=o.updated_at + timedelta(hours=2)))
            reviewed.append(o)

    # ---- today / tomorrow: live orders in various states
    def live_order(v: Vendor, c: User, d: date, slot: Slot, status: OrderStatus, qty_by_idx: dict[int, int], delivery=False):
        offs = offerings[(v.id, d, slot)]
        items, total = [], 0
        for idx, qty in qty_by_idx.items():
            off = offs[idx]
            off.portions_sold += qty
            items.append(OrderItem(offering_id=off.id, name=off.dish_name, qty=qty, unit_price=off.price))
            total += qty * off.price
        o = Order(customer_id=c.id, vendor_id=v.id, date=d, slot=slot, status=status,
                  fulfilment=Fulfilment.delivery if delivery else Fulfilment.pickup,
                  delivery_address=c.address_line if delivery else None, lat=c.lat if delivery else None, lng=c.lng if delivery else None,
                  total=total, payment_method=PaymentMethod.cod, payment_status=PaymentStatus.pending, items=items,
                  created_at=now - timedelta(minutes=rng.randint(10, 90)), updated_at=now)
        db.add(o)
        return o

    live_order(kamala, customers[1], today, Slot.dinner, OrderStatus.placed, {0: 2}, delivery=True)
    live_order(kamala, customers[3], today, Slot.dinner, OrderStatus.accepted, {1: 1})
    live_order(kamala, customers[4], today, Slot.lunch, OrderStatus.ready, {0: 1, 1: 1})
    live_order(sunita, customers[2], today, Slot.dinner, OrderStatus.placed, {0: 1, 1: 1}, delivery=True)
    live_order(sunita, customers[5], today, Slot.lunch, OrderStatus.accepted, {0: 2})
    live_order(kamala, customers[6], today + timedelta(days=1), Slot.lunch, OrderStatus.placed, {0: 1})

    # ---- subscriptions: one active with a skipped day, one paused
    ravi, priya = customers[0], customers[1]
    sub1 = Subscription(customer_id=ravi.id, plan_id=plan_k.id, vendor_id=kamala.id, start_date=today - timedelta(days=4), weeks=4,
                        status=SubscriptionStatus.active, fulfilment=Fulfilment.delivery, delivery_address=ravi.address_line,
                        lat=ravi.lat, lng=ravi.lng, created_at=now - timedelta(days=5))
    sub2 = Subscription(customer_id=priya.id, plan_id=plan_s.id, vendor_id=sunita.id, start_date=today - timedelta(days=2), weeks=2,
                        status=SubscriptionStatus.paused, paused_until=today + timedelta(days=4), fulfilment=Fulfilment.pickup,
                        created_at=now - timedelta(days=3))
    db.add_all([sub1, sub2])
    db.flush()
    skip_day = next(today + timedelta(days=n) for n in range(3, 12)
                    if (today + timedelta(days=n)).weekday() in plan_k.days_of_week)
    db.add(SubscriptionSkip(subscription_id=sub1.id, date=skip_day))
    db.commit()
    # Past tiffin meals become orders now (normally this runs lazily / via the materialize timer); settle the old ones.
    materialize_subscription_orders(db, today + timedelta(days=1))
    for o in db.scalars(select(Order).where(Order.subscription_id.is_not(None), Order.date < today)):
        o.status, o.payment_status = OrderStatus.completed, PaymentStatus.paid

    # ---- complaints
    first = completed[0]
    db.add(Complaint(order_id=first.id, vendor_id=first.vendor_id, customer_id=first.customer_id,
                     text="The rice was undercooked and the portion was smaller than last time. Please look into it."))
    db.add(Complaint(vendor_id=sunita.id, customer_id=customers[2].id, status=ComplaintStatus.resolved,
                     admin_note="Spoke to the cook; she will message before cancelling in future.",
                     text="Cook cancelled my dinner order an hour before time without a message."))
    db.commit()
    return {"vendors": vendors, "customers": customers, "admin": admin, "kamala": kamala}


def _save(img: Image.Image, subdir: str, private: bool = False) -> str:
    return save_upload(_png(img), subdir=subdir, private=private, allow_pdf=private).path


def _add_media(db, v: Vendor, i: int) -> None:
    sub = f"v{v.id}"
    spec = VENDORS[i]
    db.add(VendorMedia(vendor_id=v.id, kind=MediaKind.profile, path=_save(avatar_image(v.display_name, i), sub)))
    if spec["fssai"] != FssaiStatus.docs_pending:
        for k in range(2):
            db.add(VendorMedia(vendor_id=v.id, kind=MediaKind.kitchen, path=_save(kitchen_image(i * 10 + k), sub)))
    kinds = [MediaKind.id_proof, MediaKind.address_proof, MediaKind.passport_photo]
    have = kinds[:1] if spec["fssai"] == FssaiStatus.docs_pending else kinds
    for k in have:
        db.add(VendorMedia(vendor_id=v.id, kind=k, is_private=True, path=_save(doc_image(k.value.replace("_", " "), i), sub, private=True)))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reset", action="store_true", help="delete ALL data and uploads first")
    ap.add_argument("--force", action="store_true", help="allow running when ENV=prod")
    ap.add_argument("--admin-password", help="password for admin@gharka.local (default: random, printed)")
    args = ap.parse_args()

    settings = get_settings()
    if settings.ENV == "prod" and not args.force:
        raise SystemExit("Refusing to seed demo data with ENV=prod (use --force if you really mean it).")
    password = args.admin_password or secrets.token_urlsafe(9)
    if len(password) < 8:
        raise SystemExit("Admin password must be at least 8 characters")

    with SessionLocal() as db:
        if args.reset:
            wipe(db)
        elif db.scalar(select(func.count()).select_from(Locality)):
            print("Database already has data; nothing seeded. Use --reset to wipe and re-seed.")
            return
        r = seed(db, password)

    print(f"\nSeeded {settings.BRAND_NAME} demo data (database: {settings.DATABASE_URL}).\n")
    print("Log in with phone + OTP (the code is printed in the API terminal while SMS_PROVIDER=console):")
    print("  Cooks (vendor app, :5174)")
    for v, spec in zip(r["vendors"], VENDORS):
        live = " [LIVE]" if v.display_name in ("Kamala Iyer", "Sunita Verma") else ""
        print(f"    {spec['phone']}  {spec['name']:<14} FSSAI {spec['fssai'].value:<20}{live}")
    print("  Customers (customer app, :5173)")
    for name, phone, _ in CUSTOMERS:
        print(f"    {phone}  {name}")
    print(f"  Admin (vendor app /admin/login): admin@gharka.local / {password}")
    print("\nKamala's FSSAI registration expires in ~45 days (highlighted in the admin FSSAI tracker);")
    print("Sunita is live through the admin override; the other three cooks are not visible to customers.\n")


if __name__ == "__main__":
    main()
