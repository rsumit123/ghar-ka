# Handoff: where things stand and what to do next

Written for the next session (for example Claude Code running on the owner's Mac with access to `ssh ssh-social` and the
Vercel CLI). Read this first, then `README.md` for full commands, `docs/SPEC.md` for the product spec and `docs/NOTES.md`
for code conventions.

## State

- All five build phases are done and on `main`. 373 backend tests pass (`cd backend && uv run pytest`), both frontends build.
- Nothing is deployed yet.
- Decided hosting split: the two React apps go on **Vercel**, the FastAPI backend (plus SQLite, uploads, timers, backups)
  goes on the owner's VM reached as `ssh ssh-social`.
- A cloud session tried to create the Vercel projects through the Vercel connector and got `403 forbidden`, so the
  projects do not exist yet.

## Target layout

| Host | Serves | Where |
|---|---|---|
| `gharka.skdev.one` | customer app (`apps/customer`) | Vercel project `gharka-customer` |
| `vendor-gharka.skdev.one` | vendor app + `/admin` (`apps/vendor`) | Vercel project `gharka-vendor` |
| `api-gharka.skdev.one` | API under `/api/v1`, public photos under `/media` | VM `ssh-social`, nginx → uvicorn |

All three must stay subdomains of `skdev.one`: the session cookie is set on `.skdev.one` with SameSite=Lax. Login will
not work from `*.vercel.app` URLs, so attach the custom domains before testing login.

## Step 1: API on the VM (`ssh ssh-social`)

Follow README "Deploying to a VPS", with these differences:

1. Before installing, look at what the VM already runs: `sudo ss -ltnp` (is port 8000 free? if not, set `API_PORT` in
   `deploy/deploy.conf`), `ls /etc/nginx/sites-enabled` (nginx may already host other sites; only add ours, don't
   touch theirs), free disk for `/srv/gharka`.
2. In `deploy/deploy.conf` set `SERVE_FRONTENDS=no`. Then `render.sh --install` only installs the API nginx site, and
   `deploy.sh` skips the frontend build (Node is not needed on the VM).
3. Backend env file `/srv/gharka/backend.env` as in README step 4. `CORS_ORIGINS` must be exactly
   `https://gharka.skdev.one,https://vendor-gharka.skdev.one`. `COOKIE_DOMAIN=.skdev.one`. `ENV=prod`.
4. Skip README step 5 (frontend env) on the VM, that goes into Vercel instead.
5. DNS: A/AAAA record for `api-gharka.skdev.one` → the VM's IP.
6. HTTPS: `sudo certbot --nginx -d api-gharka.skdev.one` (only the API domain).
7. Create the admin (README step 7) and add the first locality. There is no admin screen for localities yet, so either
   run the seed on a scratch copy to see the shape, or insert one row with sqlite3, e.g.
   `INSERT INTO localities (name, city, pincode, lat, lng) VALUES ('Indiranagar','Bengaluru','560038',12.9784,77.6408);`
   (check the columns with `.schema localities` first).
8. Check: `curl https://api-gharka.skdev.one/api/v1/health`, `systemctl list-timers 'gharka-*'`.

## Step 2: frontends on Vercel

Create two projects from the GitHub repo `rsumit123/ghar-ka` (dashboard import, or `vercel link` + `vercel deploy` from
each app folder). Each app folder already has a `vercel.json` with the install/build commands, SPA rewrites and asset
caching, so only the root directory and env vars need setting.

| Setting | gharka-customer | gharka-vendor |
|---|---|---|
| Root directory | `apps/customer` | `apps/vendor` |
| Framework | Vite | Vite |
| Include files outside root directory | on (needs `packages/ui` and the root lockfile) | on |
| Node | 22.x | 22.x |

Environment variables (both projects, Production and Preview), all build-time:

```
VITE_API_URL=https://api-gharka.skdev.one
VITE_BRAND_NAME=gharka
VITE_CUSTOMER_URL=https://gharka.skdev.one
VITE_VENDOR_URL=https://vendor-gharka.skdev.one
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors
VITE_MAP_CENTER=12.9784,77.6408
VITE_TIMEZONE=Asia/Kolkata
VITE_RAZORPAY_ENABLED=false
```

Then add the domains `gharka.skdev.one` and `vendor-gharka.skdev.one` to the respective projects and create the CNAME
records Vercel asks for at the DNS host for `skdev.one` (it is not managed in Vercel).

## Step 3: smoke test in production

1. Open `https://gharka.skdev.one`, pick the locality. With no live cooks the list is empty, which is expected.
2. Open `https://vendor-gharka.skdev.one`, log in with a phone number. **The OTP is not sent by SMS**: there is only the
   console provider, so read it from `sudo journalctl -u gharka-api -f` on the VM. Fine for a soft launch with known
   cooks, not for the public (see open items).
3. Onboard as a cook, upload photos and documents, then log in at `/admin/login`, approve, set FSSAI to registration
   issued (or use the override with a reason). The cook should now show up on the customer site.
4. Place an order as a customer and walk it through accept, ready, done.
5. Things never tested for real so far: phone camera upload, GPS, OSM map tiles and Nominatim search (the build sandbox
   had no internet), nginx/systemd/certbot on a real server, Razorpay test mode.

## Open items (not done)

- **SMS provider**: implement `SmsProvider` in `backend/app/services/sms.py` (e.g. MSG91, Twilio), register it in
  `PROVIDERS`, set `SMS_PROVIDER`. Until then OTPs are only in the API log.
- **Late Razorpay payments**: if a customer pays after the 15 minute timeout auto-cancelled their order, the payment is
  recorded but the order stays cancelled and nothing flags it for refund. Add a "refund due" marker in admin orders.
  Only matters once `RAZORPAY_ENABLED=true`.
- **Admin screen to add localities** (API `POST /admin/localities` exists, no UI).
- Locality picker is alphabetical; the launch locality is not pinned first.
- Customer app is English only; vendor app is bilingual.
- For real traffic, switch OSM tiles to a provider whose terms allow it, and set a real contact in `NOMINATIM_USER_AGENT`.
