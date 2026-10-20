#!/usr/bin/env bash
# Update a running server: pull, install, migrate, build both sites, publish them, restart the API.
#   sudo ./deploy/deploy.sh            (run from the git checkout, as root or a sudoer)
# Builds read apps/customer/.env.production and apps/vendor/.env.production (see the .env.example files there).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_CONF="${DEPLOY_CONF:-$HERE/deploy.conf}"
[ -f "$DEPLOY_CONF" ] || { echo "Missing $DEPLOY_CONF"; exit 1; }
set -a; . "$DEPLOY_CONF"; set +a

as_app() { if [ "$(id -un)" = "$SERVICE_USER" ]; then "$@"; else sudo -u "$SERVICE_USER" -H "$@"; fi; }
cd "$APP_DIR"

echo "==> git pull ($GIT_BRANCH)"
as_app git fetch --quiet origin "$GIT_BRANCH"
as_app git checkout --quiet "$GIT_BRANCH"
as_app git pull --ff-only --quiet origin "$GIT_BRANCH"

echo "==> backend dependencies"
cd "$APP_DIR/backend"
if command -v uv >/dev/null; then
  as_app uv sync --frozen --no-dev
else
  [ -d .venv ] || as_app python3 -m venv .venv
  as_app .venv/bin/pip install --quiet -e .
fi

echo "==> database migrations"
# Load the same settings the service uses (values with spaces must be double-quoted in the env file).
as_app bash -c "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR/backend' && .venv/bin/alembic upgrade head"

if [ "${SERVE_FRONTENDS:-yes}" = "yes" ]; then
echo "==> frontend build"
cd "$APP_DIR"
as_app npm ci --no-audit --no-fund
as_app npm run build

echo "==> publish static sites to $WWW_DIR"
for site in customer vendor; do
  as_app rm -rf "$WWW_DIR/$site.new"
  as_app cp -r "$APP_DIR/apps/$site/dist" "$WWW_DIR/$site.new"
  as_app rm -rf "$WWW_DIR/$site.old"
  [ -d "$WWW_DIR/$site" ] && as_app mv "$WWW_DIR/$site" "$WWW_DIR/$site.old"
  as_app mv "$WWW_DIR/$site.new" "$WWW_DIR/$site"
done
else
  echo "==> SERVE_FRONTENDS=no: skipping frontend build (sites are hosted elsewhere)"
fi

echo "==> restart API"
systemctl restart "$APP_NAME-api.service"
sleep 2
systemctl is-active --quiet "$APP_NAME-api.service" && echo "API is running." || { journalctl -u "$APP_NAME-api.service" -n 30 --no-pager; exit 1; }
curl -fsS "http://127.0.0.1:${API_PORT}/api/v1/localities" >/dev/null && echo "Health check OK." || echo "WARNING: health check failed"
echo "Done."
