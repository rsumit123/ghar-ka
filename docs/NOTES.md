# Build notes (conventions for later phases)

## Backend conventions
- Add a router: `backend/app/routers/<name>.py` with `router = APIRouter(...)`, append to `ROUTERS` in `app/main.py` (mounted under `/api/v1`).
- `app/deps.py`: `DbDep`, `CurrentUser`, `get_optional_user`, `require_role(Role.x, ...)` (returns the User), `require_xhr_header` (multipart endpoints need `X-Requested-With: gharka`).
- Model changes: `uv run alembic revision --autogenerate -m ...` (batch mode); verify with `alembic check`.
- `app/db.py`: `UTCDateTime`, `str_enum()`, `utcnow()` (aware UTC). Naive datetimes are rejected.
- Tests: `tests/conftest.py` fixtures `db`, `client`, `sms` (`sms.last_code(phone)`), `make_user(Role.x, **fields)`, `login_as(user)`. UPLOAD_DIR is a temp dir. No network in tests (monkeypatch `httpx.get`).
- Admin actions always write AuditLog via `services.audit.write_audit(db, actor_id, action, entity, entity_id, details)` (caller commits). Vendor-scoped actions use `entity="vendor"`, `entity_id=vendor.id`, actions like `vendor.approve`, `vendor.fssai_update`, `vendor.override`, `fssai.docs_received`.

## Services added in Phase 2
- `services/images.py`: `save_upload(fileobj, *, subdir, private, allow_pdf=False) -> StoredFile(path, is_private, content_type)`; `process_image(bytes)`; `delete_stored(path, private)`; `resolve_path(path, private)` (traversal-safe); `UploadError(detail, status_code)`. Random-named `.jpg` (or `.pdf` for private docs). Paths are relative to `UPLOAD_DIR/public|private`; public ones are served at `/media/<path>`. Dish photos: `save_upload(..., subdir=f"v{vendor.id}", private=False)`.
- `services/golive.py`: `is_vendor_live(vendor, fssai, today)` and `live_vendor_filter(today)` (SQL expression on `Vendor`, EXISTS on FssaiRecord, no join needed; a test asserts both agree). Phase 3 listing: `select(Vendor).where(live_vendor_filter(local_today()))`.
- `services/clock.py`: `local_today()`. `services/vendors.py`: `get_vendor_for_user`, `missing_docs`, `vendor_is_live`, `media_out`, `advance_docs_if_complete`. `services/audit.py`: `write_audit`.
- `services/geo.py`: `search(db, q)`, `reverse(db, lat, lng)`; `MIN_INTERVAL_S` global throttle (0 in tests); `GeoError` -> 502. GeocodeCache keys: `s:<normalised q>#<i>` (one row per search result) and `r:<lat4>,<lng4>`. No schema change.

## API notes
- `GET /vendor/me` returns 200 `{onboarded:false, phone}` when not onboarded (not 404). Otherwise profile, `review_status`, `review_note`, `is_live`, `fssai`, `media` (private media have `path: null`), `docs_complete`, `missing_docs`.
- Media kinds: `profile` (replaces previous), `kitchen` (max 6), `id_proof|address_proof|passport_photo` (private, one per kind, replaced on re-upload, PDF allowed). `dish` is rejected on `/vendor/media` (menu endpoints will handle it).
- Rejected vendors: `POST /vendor/resubmit` or any `PUT /vendor/profile` sets status back to `pending`.
- Admin: approve (from pending/rejected), reject (note required), suspend (deletes vendor sessions), unsuspend (-> approved if ever approved else pending). Override needs reason >= 5 chars. `GET /admin/audit?page=&page_size=&entity=&entity_id=`. `GET /admin/media/{id}` serves private files (admin only, no-store). Dashboard keys: active_vendors, live_vendors, pending_vendors, fssai_expiring_60d, orders_today, orders_this_week, repeat_customer_rate (order ones are 0 until Phase 4).
- Admin media URL: `${brand.apiUrl}/api/v1/admin/media/<id>`; `<img>` works because the cookie is same-site.

## Frontend
- `@gharka/ui` additions: `Modal({open,onClose,title})`, `Switch({checked,onChange,label,hint})`. i18n keys are camelCase, grouped by comments in `i18n.ts`. Admin UI is English-only plain strings.
- Vendor app: `lib/useVendor.tsx` (`VendorProvider`/`useVendor()` -> `{me, reload, setMe}` wraps vendor routes), `lib/upload.ts` (`uploadWithProgress`), `lib/types.ts`, `lib/adminTypes.ts`, `lib/format.ts`; components `components/vendor/{UploadTile,KitchenPhotos,DocCards,Steps}`, `components/admin/{AdminLayout,bits}`. `/` -> `VendorEntry` (onboarding / status / home tiles). `/orders`, `/menu`, `/plans` and admin Orders/Complaints are placeholders for Phases 3/4.
- Local: `cd backend && uv run alembic upgrade head`, `uv run python -m app.cli create-admin ...`, `npm run dev`. Map tiles/marker icons need internet.
