# gharka — MVP spec (source of truth for all build phases)

"gharka" is a placeholder brand. Brand name, domains, colours-as-tokens and feature flags must come from config
(`backend/.env` → `Settings`, frontend `packages/ui/src/brand.ts` reading `import.meta.env.VITE_*`). Never hardcode the name elsewhere.

Hyperlocal home-food marketplace. Households are vendors. Customers in the same locality pre-order home-cooked meals
for a specific date+slot or subscribe to tiffin plans. One city locality at launch.

## Stack
- Backend: FastAPI, SQLAlchemy 2.x (typed ORM, `Mapped[]`), Alembic, SQLite. Postgres must be a `DATABASE_URL` change only
  (no SQLite-only SQL; use portable types; JSON via `sqlalchemy.JSON`). Pydantic v2 + pydantic-settings. Pillow for images.
  pytest + httpx TestClient. Python 3.12+. Dependencies managed with `uv` (`backend/pyproject.toml`), but plain pip must also work.
- Frontend: React 18 + TypeScript + Vite + Tailwind 3. npm workspaces. `react-router-dom`. No state library; small hooks + fetch.
  Maps: `leaflet` + `react-leaflet` with OpenStreetMap tiles (URL + attribution from env). Keep deps minimal.
- Root `npm run dev` starts API :8000, customer :5173, vendor :5174 via `concurrently`.

## Repo layout
```
backend/
  app/ main.py config.py db.py models/ schemas/ routers/ services/ cli.py
  alembic/ alembic.ini tests/ scripts/seed.py
apps/customer/   (Vite app, customer site — gharka.skdev.one)
apps/vendor/     (Vite app, vendor site + /admin — vendor-gharka.skdev.one)
packages/ui/     (shared: tailwind preset, components, api client, i18n, brand, map components)
deploy/          (nginx, systemd, backup script)
docs/
```

## Auth
- httpOnly Secure (Secure off in dev) SameSite=Lax cookie `COOKIE_NAME`, domain `COOKIE_DOMAIN` (`.skdev.one` prod, unset locally).
  Value is random token; DB stores sha256 hash in `sessions`. Logout/suspension deletes sessions → instant revoke.
- CSRF: SameSite=Lax + strict CORS allowlist (`CORS_ORIGINS`, credentials allowed) + mutating endpoints accept JSON only
  (multipart upload endpoints additionally require header `X-Requested-With: gharka`).
- Phone OTP for customers and vendors: `POST /auth/otp/request {phone, role}`, `POST /auth/otp/verify {phone, code, role}`.
  6-digit, hashed, 5 min expiry, max 5 attempts, rate-limit requests per phone. `SmsProvider` protocol with `ConsoleSmsProvider`
  (logs OTP) selected by `SMS_PROVIDER=console`. Phone normalised to E.164 (+91 default).
  A user row has one role. Same phone could be both customer and vendor → allow: `users` unique on (phone, role).
- Admin: email+password (argon2 or bcrypt via `passlib`/`bcrypt`), created with `python -m app.cli create-admin --email --password`.

## Data model (money = integer paise; datetimes stored UTC, displayed in `APP_TIMEZONE`=Asia/Kolkata)
- User: id, role(customer|vendor|admin), phone?, email?, password_hash?, name, address_line?, pincode?, lat?, lng?, created_at
- OtpCode, Session(token_hash, user_id, expires_at)
- Locality: id, name, city, pincode, lat, lng (seeded launch area; admin can add)
- GeocodeCache: query (unique, normalised), lat, lng, display_name, created_at
- Vendor: id, user_id, display_name, story(short line), locality_id, pincode, lat, lng, address_line, whatsapp_phone,
  review_status(pending|approved|rejected|suspended), review_note, offers_pickup(bool), delivery_radius_km(float, 0=no delivery),
  live_override(bool), live_override_reason, created_at, approved_at
- VendorMedia: id, vendor_id, kind(profile|kitchen|id_proof|address_proof|passport_photo|dish), path, is_private, created_at
  Private kinds (id_proof, address_proof, passport_photo) stored under `UPLOAD_DIR/private`, only served via admin endpoint.
  Public under `UPLOAD_DIR/public`, served at `/media/...`. Pillow: fix EXIF orientation, strip EXIF, max 1600px, JPEG q=82.
  Max upload `MAX_UPLOAD_MB`. Accept jpeg/png/webp/heic-if-pillow-supports; PDFs allowed for private docs (stored as-is, size-checked).
- FssaiRecord (1:1 vendor): status(docs_pending|docs_received|application_filed|registration_issued|rejected), application_id,
  registration_number, issue_date, expiry_date, notes, updated_at
- MenuOffering: id, vendor_id, date, slot(lunch|dinner), dish_name, description, photo_path?, price, diet(veg|nonveg|egg),
  portions_total, portions_sold, cutoff_at(datetime), created_at
- Order: id, customer_id, vendor_id, date, slot, status(placed|accepted|ready|completed|cancelled), fulfilment(pickup|delivery),
  delivery_address?, lat?, lng?, total, payment_method(cod|razorpay), payment_status(pending|paid|failed|refunded),
  razorpay_order_id?, subscription_id?, cancel_reason?, created_at, updated_at
- OrderItem: id, order_id, offering_id?, name, qty, unit_price
- TiffinPlan: id, vendor_id, name, description, slot, days_of_week (JSON list 0-6, Mon=0), price_per_week, diet, active,
  cutoff_hours_before (default 12) — cutoff for a given meal date = slot start time (LUNCH_START=12:00, DINNER_START=19:30 config) minus hours
- Subscription: id, customer_id, plan_id, vendor_id, start_date, weeks, status(active|paused|cancelled), paused_until?,
  fulfilment, delivery_address?, created_at
- SubscriptionSkip: subscription_id, date (unique together)
- Review: id, order_id unique, customer_id, vendor_id, rating 1-5, text(≤280), created_at
- Complaint: id, order_id?, vendor_id, customer_id, text, status(open|resolved), admin_note, created_at
- AuditLog: id, actor_id, action, entity, entity_id, details JSON, created_at

## Core rules (in `services/`, unit tested)
- `is_vendor_live(vendor, fssai, today)`: not suspended AND ((review_status==approved AND fssai.status==registration_issued AND
  (expiry_date is None or expiry_date >= today)) OR live_override). Override on/off requires reason, written to AuditLog.
  Only live vendors appear in public listing/profile and accept orders.
- Order placement: all items same vendor, same date+slot; vendor live; each offering's cutoff_at > now; capacity reserved with a single
  atomic conditional UPDATE (`portions_sold + q <= portions_total AND cutoff_at > now`), all-or-nothing in a transaction.
  Fulfilment: pickup requires offers_pickup; delivery requires distance(customer, vendor) <= delivery_radius_km (haversine).
  Offering is "closed" if sold out or past cutoff — API returns `is_open`, `portions_left`.
- Customer cancel: allowed while status==placed and before cutoff; releases portions. Vendor can cancel with reason any time before completed (releases portions if before cutoff).
- Status transitions: placed→accepted→ready→completed; placed/accepted/ready→cancelled. Enforce.
- Subscriptions: pause (until date or indefinitely)/resume/skip a date — skip only allowed before that date's cutoff.
  `materialize_subscription_orders(db, until_date)` idempotently creates Order rows (subscription_id set, one item = plan name,
  price = price_per_week / len(days_of_week)) for dates whose cutoff has passed, skipping skipped/paused/inactive. Called on vendor
  orders list load and via `python -m app.cli materialize`.
- Reviews only for own completed orders, once. Vendor stats: rating_avg, rating_count, orders_served (completed).
- Payments: COD default. `RAZORPAY_ENABLED` flag + key id/secret; create order via Razorpay REST (httpx), verify HMAC signature.
  Use stdlib/httpx, no razorpay SDK.

## Maps (OpenStreetMap)
- Backend `GET /geo/search?q=` → proxies Nominatim (`NOMINATIM_URL`, `NOMINATIM_USER_AGENT`, countrycodes=`GEO_COUNTRY`), cached
  in GeocodeCache, global 1 req/sec throttle, short timeout; returns [{display_name, lat, lng}]. `GET /geo/reverse?lat=&lng=` likewise (cache by rounded coords).
- Frontend shared `MapView` / `LocationPicker` (react-leaflet, tiles `VITE_MAP_TILE_URL`, attribution `VITE_MAP_ATTRIBUTION`).
  LocationPicker: big "Use my location" button (navigator.geolocation), search box (calls /geo/search), draggable pin.
- Vendor onboarding: pick kitchen location on map (optional; fallback locality centroid). Delivery settings show radius circle on map.
- Customer home: list/map toggle showing nearby live vendors; locate-me or pincode/locality search sets the reference point.
  Vendor profile shows a small map with approximate location (round to ~3 decimals publicly for privacy; exact only to admin).
- Admin vendor detail shows exact pin.

## API (`/api/v1`)
auth: POST otp/request, otp/verify, admin/login, logout; GET me
public: GET localities; GET vendors?pincode=&locality_id=&lat=&lng=&date=&slot=&diet= (live only, with distance_km, delivers_to_you,
  next offerings summary, rating, orders_served, fssai_registered badge); GET vendors/{id}?date=&slot= (profile, photos, menu, plans, reviews)
geo: GET geo/search, geo/reverse
customer: PUT me; POST orders; GET orders; GET orders/{id}; POST orders/{id}/cancel; POST orders/{id}/review;
  POST subscriptions; GET subscriptions; POST subscriptions/{id}/pause|resume|cancel; POST subscriptions/{id}/skip {date};
  DELETE subscriptions/{id}/skip/{date}; POST complaints; POST payments/razorpay/order, payments/razorpay/verify (flagged)
vendor: GET vendor/me; POST vendor/onboard; PUT vendor/profile; PUT vendor/fulfilment; POST vendor/media (multipart, kind);
  DELETE vendor/media/{id}; GET/POST vendor/offerings (POST accepts dates[] to repeat); PUT/DELETE vendor/offerings/{id};
  POST vendor/offerings/copy {from_date, to_dates}; GET vendor/orders?date=; POST vendor/orders/{id}/accept|ready|complete|cancel;
  GET/POST vendor/plans; PUT vendor/plans/{id}; GET vendor/subscribers
admin: GET admin/dashboard (active/live vendors, pending vendors, orders today/this week, repeat customer rate = customers with ≥2
  completed orders / customers with ≥1, FSSAI expiring ≤60d count); GET admin/vendors?status=; GET admin/vendors/{id};
  POST admin/vendors/{id}/approve|reject|suspend|unsuspend {note}; PUT admin/vendors/{id}/fssai; PUT admin/vendors/{id}/override
  {enabled, reason}; GET admin/fssai?expiring_within=; GET admin/orders?vendor_id=&date_from=&date_to=&status=;
  GET admin/complaints; PUT admin/complaints/{id}; GET admin/audit; GET admin/media/{id}
media: static `/media/` for public uploads.
Errors: JSON `{detail}` with sensible codes. All admin actions write AuditLog.

## Frontend
Customer: Home (locality/pincode picker or locate-me, date chips next 7 days, slot toggle, diet filter, list/map toggle, cook-first
  vendor cards: cook photo + name + story line + rating + "FSSAI registered" badge + today's dishes small), Vendor profile (cook/kitchen
  photos, story, badges, orders served, menu for date/slot with portions left/closed state, tiffin plans, reviews, map, WhatsApp
  `https://wa.me/<digits>?text=`), Cart/Checkout (fulfilment choice, address, COD / Razorpay if flag), Login OTP, My orders (status
  timeline, cancel, review), My tiffins (pause/resume/skip date/cancel), Profile (name, address, location), Help/complaint.
Vendor: Login OTP, Onboarding stepper (1 About you: name, locality/pincode, cooking line, map location; 2 Kitchen photos — camera
  `capture="environment"`; 3 Documents: photo ID, address proof, passport photo; 4 Done), Pending/rejected status screen, Today orders
  (grouped by slot, giant Accept/Ready/Done buttons, call/WhatsApp customer), Menu (add dish with minimal typing: number steppers,
  diet chips, time presets for cutoff, "copy yesterday", "repeat for week"), Tiffin plans, Delivery settings (pickup toggle, radius
  slider + map circle), Profile. Labels bilingual Hindi + English (shared i18n dict; vendor app shows both together, e.g.
  "Accept / स्वीकार करें"). Large tap targets (min 48px, primary 56px), high contrast.
Admin (`/admin/*` in vendor app, admin role only): Login, Dashboard, Vendor queue, Vendor detail (all fields, photos, private docs,
  map pin, approve/reject with note, FSSAI form, override toggle + reason, suspend), FSSAI tracker (table, expiring ≤60d highlighted,
  expired red), Orders (filters), Complaints, Audit log. Desktop-friendly but works on mobile.

## Design direction
Not Zomato/Swiggy. No red-and-white. Warm, homely, handcrafted — a neighbour's kitchen.
Tokens (Tailwind preset in packages/ui): turmeric `#E3A008`-ish family, terracotta `#C2603E`-ish, leaf green `#4F7942`-ish,
warm off-white background `#FBF6EC`, ink `#2B2118`. Serif headings (Google Fonts "Fraunces" or "Young Serif"), sans body ("Inter" or
"Hind" — Hind/Noto Sans Devanagari for Hindi), handwritten accent ("Caveat") used sparingly. Subtle paper texture via CSS only,
inline SVG steel-tiffin illustration in empty states/hero. Rounded, soft shadows, mobile-first. Fast: no heavy images.

## Deliverables
README (local setup; VPS deploy: Nginx for 3 subdomains, systemd for uvicorn, certbot, SQLite + uploads on persistent disk, daily
backup via cron using `sqlite3 .backup` + tar uploads with retention), Alembic migrations, `scripts/seed.py` (localities, 5 vendors
one per FSSAI status, menus for next days, plans, customers, orders incl. completed + reviews, an admin), `.env.example` for backend
and each frontend listing every setting, tests for cutoff, capacity (incl. concurrent oversell attempt), go-live rule.
