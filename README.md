# gharka

A hyperlocal home-food marketplace. Households are the vendors ("cooks"); customers in the same neighbourhood pre-order
home-cooked meals for a specific date and lunch/dinner slot, or subscribe to weekly tiffin plans. One city locality at launch.
"gharka" is a placeholder brand: see [Renaming the brand](#renaming-the-brand).

Product spec: [`docs/SPEC.md`](docs/SPEC.md). Build/conventions notes: [`docs/NOTES.md`](docs/NOTES.md).

## Architecture

npm-workspaces monorepo with a Python API.

```
backend/          FastAPI + SQLAlchemy 2 + Alembic (SQLite by default, Postgres by URL change)
  app/            main.py config.py db.py models/ schemas/ routers/ services/ cli.py
  alembic/        migrations          scripts/seed.py   demo data          tests/   pytest
apps/customer/    customer site (Vite + React + Tailwind)        -> gharka.skdev.one
apps/vendor/      cooks' site + /admin (same Vite app)           -> vendor-gharka.skdev.one
packages/ui/      shared Tailwind preset, components, API client, i18n, brand config, map components
deploy/           nginx + systemd templates, backup.sh, deploy.sh
docs/             SPEC.md, NOTES.md
```

The API serves `/api/v1/*` and public uploads at `/media/*`. Both frontends are static builds that talk to the API with a
session cookie (httpOnly, SameSite=Lax, shared across subdomains in production through `COOKIE_DOMAIN`).

## Local setup

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/) (plain `pip` also works, see below), Node 20+.

```sh
npm install
npm run setup                 # cd backend && uv sync && alembic upgrade head  (creates backend/gharka.db)
cd backend && uv run python scripts/seed.py && cd ..    # demo data (prints login phones and the admin password)
npm run dev                   # API :8000, customer :5173, vendor :5174 (+ cooks' app)
```

Without uv: `cd backend && python -m venv .venv && .venv/bin/pip install -e . pytest && .venv/bin/alembic upgrade head`
(`npm run dev:api` uses `backend/.venv` when it exists).

Settings are optional locally: defaults work. To change them copy `backend/.env.example` to `backend/.env` and
`apps/*/.env.example` to `apps/*/.env`.

### Logging in during development (OTP)

Customers and cooks log in with a phone number and a 6-digit code. With `SMS_PROVIDER=console` (the default) the code is
**printed in the API terminal**, for example `SMS to +919810000001: gharka: your login code is 123456`. After `seed.py`:

| Who | Where | Login |
| --- | --- | --- |
| Customers `+919810000001` ... `+919810000008` | http://localhost:5173 | phone, then the code from the API log |
| Cooks `+919820000001` ... `+919820000005` | http://localhost:5174 | phone, then the code from the API log |
| Admin | http://localhost:5174/admin/login | `admin@gharka.local` and the password printed by the seed (or `--admin-password`) |

Seeded cooks, one per FSSAI status: Kamala Iyer (registration issued, expires in about 45 days, **live**), Sunita Verma
(application filed, **live through the admin override**), Farida Sheikh (docs received), Meera Joshi (docs pending), Lakshmi
Reddy (rejected). Customers browsing Indiranagar see only the two live cooks. OTP requests are limited to 3 per phone per 10 minutes
(`OTP_RATE_LIMIT_COUNT`); raise it when clicking around a lot.

`seed.py` options: `--reset` wipes all data and uploads first, `--admin-password`, `--force` (required when `ENV=prod`).
Without `--reset` it does nothing if the database already has data. Dates are relative to today, so re-seed (with `--reset`)
when the menus run out.

### Creating an admin

```sh
cd backend && uv run python -m app.cli create-admin --email you@example.com --password 'a-long-password'
```
Running it again for the same email resets the password.

### Tests and checks

```sh
npm test                                   # backend pytest (about 370 tests; temp SQLite databases, no network)
cd backend && uv run alembic check         # models and migrations agree
npm run build                              # type-checks (tsc) and builds both frontends
cd backend && TEST_DATABASE_URL=postgresql+psycopg://user:pw@localhost/gharka_test uv run --extra postgres pytest   # whole suite on Postgres
```

### Background job

`cd backend && uv run python -m app.cli materialize` creates the orders for tiffin subscription meals whose order-by time has
passed and cancels unpaid online orders. The same work also happens lazily when orders are listed. In production a systemd timer
runs it every 15 minutes (see [Deployment](#deploying-to-a-vps-ubuntu-2404)). It is safe to run repeatedly.

## Configuration reference

Every backend setting lives in `backend/app/config.py` and is documented in `backend/.env.example` (a test keeps them in sync).
Values come from the environment or `backend/.env`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `ENV` | `dev` | `prod` makes the cookie Secure by default and makes `seed.py` refuse to run |
| `BRAND_NAME` | `gharka` | name in SMS text and the API title |
| `DATABASE_URL` | `sqlite:///./gharka.db` | SQLAlchemy URL; Postgres is only a URL change |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | browser origins allowed (with credentials) |
| `COOKIE_NAME`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `SESSION_DAYS` | `gharka_session`, unset, auto, `30` | session cookie; set `COOKIE_DOMAIN=.skdev.one` in production |
| `SMS_PROVIDER` | `console` | OTP delivery provider |
| `OTP_LENGTH`, `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RATE_LIMIT_COUNT`, `OTP_RATE_LIMIT_WINDOW_MINUTES` | `6`, `5`, `5`, `3`, `10` | OTP rules |
| `DEFAULT_COUNTRY_CODE` | `+91` | for bare 10-digit numbers |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | `./uploads`, `8` | uploads (`public/` served at `/media`, `private/` admin-only) |
| `APP_TIMEZONE`, `LUNCH_START`, `DINNER_START` | `Asia/Kolkata`, `12:00`, `19:30` | slot times; cutoffs count back from these |
| `PUBLIC_SEARCH_RADIUS_KM` | `5` | discovery radius beyond same pincode/locality |
| `RAZORPAY_ENABLED`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_API_URL`, `RAZORPAY_PAYMENT_TIMEOUT_MINUTES` | off, empty, empty, empty, Razorpay v1 URL, `15` | online payments, see [Payments](#payments-razorpay) |
| `NOMINATIM_URL`, `NOMINATIM_USER_AGENT`, `GEO_COUNTRY` | OSM Nominatim, dev UA, `in` | address search proxy |

Frontend settings (`apps/customer/.env.example`, `apps/vendor/.env.example`; Vite reads them at **build** time):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API origin, e.g. `https://api-gharka.skdev.one` |
| `VITE_BRAND_NAME` | brand name in the UI and page titles |
| `VITE_CUSTOMER_URL`, `VITE_VENDOR_URL` | public site URLs |
| `VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION`, `VITE_MAP_CENTER` | map tiles and fallback centre (`lat,lng`) |
| `VITE_TIMEZONE` | display time zone (mirror of `APP_TIMEZONE`) |
| `VITE_RAZORPAY_ENABLED` | show "Pay online" and load Razorpay's checkout script |

## Renaming the brand

- Backend: `BRAND_NAME` in the env file.
- Frontends: `VITE_BRAND_NAME` (header wordmark, page titles, Razorpay window name) and rebuild. Colours are tokens in `packages/ui/tailwind-preset.cjs`; the favicon is `apps/*/public/favicon.svg`.
- Server: `APP_NAME`, `BRAND_NAME` and the three domains in `deploy/deploy.conf`, then `deploy/render.sh --install` (service names, nginx files and backup file names follow `APP_NAME`).
- Defaults such as the cookie name (`COOKIE_NAME`) and `NOMINATIM_USER_AGENT` should be changed too.

## Maps

Maps use Leaflet with OpenStreetMap raster tiles; address search and reverse geocoding go through the API
(`/api/v1/geo/search`, `/geo/reverse`), which calls Nominatim, caches every result in the database, throttles to 1 request per second
and sends `NOMINATIM_USER_AGENT`. Respect the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):
set a real contact in the user agent, and for anything beyond light traffic host your own Nominatim or use a commercial geocoder.
The public `tile.openstreetmap.org` server is also not meant for production traffic
([tile policy](https://operations.osmfoundation.org/policies/tiles/)). To switch tile provider set `VITE_MAP_TILE_URL` (a
`{z}/{x}/{y}` template, including any API key) and `VITE_MAP_ATTRIBUTION` to that provider's required text, then rebuild.
Tiles need internet access; the app works (without the map background) when they cannot load.

## Payments (Razorpay)

Cash on delivery is always available. Online payment is off unless **both** flags are set: backend `RAZORPAY_ENABLED=true` plus
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, and frontend `VITE_RAZORPAY_ENABLED=true` (rebuild the customer app). Use Razorpay
test keys (`rzp_test_...`) first. With the flag off the `payments/razorpay/*` endpoints return 404 and the `razorpay` payment method is
rejected.

Flow: the customer places the order with `payment_method=razorpay`, which reserves the portions and stores the order as unpaid
(the cook does not see it yet); the browser asks `POST /api/v1/payments/razorpay/order` to create a Razorpay order, loads
`https://checkout.razorpay.com/v1/checkout.js` (only when the flag is on), and after payment calls `POST .../verify`, where the server checks
the HMAC-SHA256 signature in constant time and marks the order paid. As a backup, configure a Razorpay webhook to
`https://<API_DOMAIN>/api/v1/payments/razorpay/webhook` (events `payment.captured`, `payment.failed`) with a secret in `RAZORPAY_WEBHOOK_SECRET`;
it is idempotent. Orders not paid within `RAZORPAY_PAYMENT_TIMEOUT_MINUTES` (15) are cancelled and their portions released by the
materialize timer and on reads. Tiffin subscription orders are always cash on delivery. **Refunds are not automated**: if a paid online order is
cancelled, refund it from the Razorpay dashboard.

## Deploying to a VPS (Ubuntu 24.04)

Layout used below (edit `deploy/deploy.conf` to change anything): code in `/srv/gharka/app`, database in `/srv/gharka/data`, uploads in
`/srv/gharka/uploads`, backups in `/srv/gharka/backups`, built sites in `/srv/gharka/www`. Put `/srv/gharka` on the persistent disk.
SQLite and the uploads live on that disk, so the server can be rebuilt from a backup.

1. **DNS**: create three A (and AAAA) records pointing at the server: `gharka.skdev.one` (customers), `vendor-gharka.skdev.one` (cooks + admin),
   `api-gharka.skdev.one` (API and `/media`).
2. **Packages**:
   ```sh
   sudo apt update && sudo apt install -y nginx git python3 python3-venv sqlite3 certbot python3-certbot-nginx curl gettext-base
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
   curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin sh     # optional; deploy.sh falls back to venv + pip
   ```
3. **User and directories**:
   ```sh
   sudo useradd --system --create-home --home-dir /srv/gharka --shell /bin/bash gharka
   sudo -u gharka mkdir -p /srv/gharka/{app,data,uploads/public,uploads/private,backups,www}
   sudo -u gharka git clone <your-repo-url> /srv/gharka/app
   ```
4. **Backend env file** `/srv/gharka/backend.env` (`chmod 600`, owner gharka). Copy `backend/.env.example` and set at least (double-quote values containing spaces):
   ```sh
   ENV=prod
   BRAND_NAME=gharka
   DATABASE_URL=sqlite:////srv/gharka/data/gharka.db
   UPLOAD_DIR=/srv/gharka/uploads
   CORS_ORIGINS=https://gharka.skdev.one,https://vendor-gharka.skdev.one
   COOKIE_DOMAIN=.skdev.one
   NOMINATIM_USER_AGENT="gharka/1.0 (contact: you@yourdomain)"
   ```
5. **Frontend env** (used at build time): `cp apps/customer/.env.example apps/customer/.env.production` and the same for `apps/vendor`, then set
   `VITE_API_URL=https://api-gharka.skdev.one`, `VITE_CUSTOMER_URL=https://gharka.skdev.one`, `VITE_VENDOR_URL=https://vendor-gharka.skdev.one`
   (and the tile/brand settings you want).
6. **Deploy config**: `cd /srv/gharka/app/deploy && cp deploy.conf.example deploy.conf` and edit domains/paths.
7. **Initial admin** (after step 8 has built the app and created the database):
   `sudo -u gharka bash -c 'set -a; . /srv/gharka/backend.env; set +a; cd /srv/gharka/app/backend && .venv/bin/python -m app.cli create-admin --email you@x.com --password "..."'`.
8. **nginx + systemd**: `sudo ./render.sh --install` renders `deploy/nginx/*.in` and `deploy/systemd/*.in` from `deploy.conf`, installs the three nginx sites,
   `gharka-api.service`, `gharka-materialize.timer` (every 15 minutes) and `gharka-backup.timer` (daily 03:30), and enables them. Then run `sudo ./deploy.sh` (first build, migrations, publish; do this before step 7).
   The API runs as the `gharka` user with one uvicorn worker (SQLite).
9. **HTTPS**: `sudo certbot --nginx -d gharka.skdev.one -d vendor-gharka.skdev.one -d api-gharka.skdev.one` (adds the 443 blocks and the redirect; renewal is automatic).
10. **Verify**: `systemctl status gharka-api`, `systemctl list-timers 'gharka-*'`, `curl https://api-gharka.skdev.one/api/v1/localities`, open both sites, log in to `/admin/login`,
    and add a first locality through the admin or the database (the seed script is for demos; do not run it in production without `--force`).

**Updating**: `sudo /srv/gharka/app/deploy/deploy.sh` (git pull, dependencies, `alembic upgrade head`, `npm ci` and build, swap the static sites, restart the API).

**Backups**: `deploy/backup.sh` writes `/srv/gharka/backups/gharka-<timestamp>.tar.gz` (a consistent database snapshot plus both upload folders, mode 600) and
deletes archives older than 14 days. The uploads include cooks' ID documents, so encrypt before copying off the server; there are commented `rclone`/`rsync` hooks at the end of the script.

**Restoring**:
```sh
sudo systemctl stop gharka-api gharka-materialize.timer
mkdir /tmp/restore && tar -xzf /srv/gharka/backups/gharka-XXXX.tar.gz -C /tmp/restore
sudo -u gharka cp /tmp/restore/database.sqlite3 /srv/gharka/data/gharka.db
sudo -u gharka rm -f /srv/gharka/data/gharka.db-wal /srv/gharka/data/gharka.db-shm
sudo rsync -a --delete /tmp/restore/uploads/ /srv/gharka/uploads/ && sudo chown -R gharka:gharka /srv/gharka/uploads
sudo systemctl start gharka-api gharka-materialize.timer
```

## Switching to Postgres

```sh
cd backend && uv sync --extra postgres            # installs psycopg (or: pip install -e '.[postgres]')
# in the env file:
DATABASE_URL=postgresql+psycopg://gharka:password@localhost/gharka
uv run alembic upgrade head
```
The code has no SQLite-only SQL and the migrations create the same schema on both (the full test suite passes on PostgreSQL 16).
Create the database and role first. Data is not migrated automatically: for an existing SQLite database, export/import the tables yourself.
Set `API_WORKERS` above 1 only after switching; `backup.sh` uses `pg_dump` when `BACKUP_PG_URL` is set in `deploy.conf`.

## Security notes

- Sessions: random token in an httpOnly cookie, only its SHA-256 stored; logout or suspension deletes sessions at once. Set `COOKIE_DOMAIN` to the parent domain so the
  customer, vendor and API subdomains share the cookie, and keep `ENV=prod` so it is `Secure`.
- CSRF: SameSite=Lax cookies, a strict `CORS_ORIGINS` allowlist (list exactly your two site origins), JSON-only mutating endpoints, and `X-Requested-With: gharka` on uploads.
- OTP: hashed codes, 5 minute expiry, 5 attempts, per-phone request rate limit. For real SMS, implement the `SmsProvider` protocol in `backend/app/services/sms.py`
  (`send(phone, message)`), register it in `PROVIDERS` and set `SMS_PROVIDER`. Never ship `console` to production: it logs the codes.
- Uploads: files are re-encoded with Pillow (EXIF stripped), named randomly, and the identity documents are only served through the admin endpoint. nginx maps only `uploads/public`.
- Public pages show approximate cook locations (rounded) and share a pickup address only after the cook accepts.
- Razorpay webhooks and checkout signatures are verified in constant time; keep keys only in the backend env file.

## Known limitations

- No real SMS provider, push notifications or email. The cook's orders page polls every 30 seconds.
- Razorpay refunds, payouts/settlements and cook commission are not implemented; tiffin subscriptions are cash on delivery only.
- Tiffin orders are created lazily (on list reads and by the 15 minute timer), not at the exact cutoff.
- Single city launch: localities are added through the database/seed (no admin UI to add them yet).
- SQLite means one API worker and one server; use Postgres to scale out.
- The public OSM tile and Nominatim servers are for light use only.
- No automated browser tests; UI was checked by hand with Playwright screenshots at phone width (and desktop for admin).
