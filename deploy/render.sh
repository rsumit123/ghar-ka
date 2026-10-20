#!/usr/bin/env bash
# Render nginx + systemd templates from deploy.conf into deploy/out/. With --install (run as root): copy them into
# /etc/nginx/sites-available (+ enable), /etc/systemd/system, then reload and enable the timers.
#   cp deploy.conf.example deploy.conf && $EDITOR deploy.conf && sudo ./render.sh --install
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_CONF="${DEPLOY_CONF:-$HERE/deploy.conf}"
[ -f "$DEPLOY_CONF" ] || { echo "Missing $DEPLOY_CONF (copy deploy.conf.example)"; exit 1; }
set -a; . "$DEPLOY_CONF"; set +a
export DEPLOY_CONF_PATH="$DEPLOY_CONF"

# Keep nginx's body limit in step with MAX_UPLOAD_MB (from the backend env file if it exists).
if [ -f "${ENV_FILE:-/nonexistent}" ] && grep -qE '^MAX_UPLOAD_MB=' "$ENV_FILE"; then
  MAX_UPLOAD_MB="$(grep -E '^MAX_UPLOAD_MB=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '"')"
fi
export CLIENT_MAX_BODY_SIZE=$(( MAX_UPLOAD_MB + 1 ))

VARS='${APP_NAME} ${BRAND_NAME} ${CUSTOMER_DOMAIN} ${VENDOR_DOMAIN} ${API_DOMAIN} ${SERVICE_USER} ${APP_DIR} ${DATA_DIR} ${UPLOAD_DIR} ${BACKUP_DIR} ${WWW_DIR} ${ENV_FILE} ${API_PORT} ${API_WORKERS} ${CLIENT_MAX_BODY_SIZE} ${DEPLOY_CONF_PATH}'

# envsubst replaces only the listed variables, so nginx's own $uri/$host are untouched. Fallback: python.
subst() {
  if command -v envsubst >/dev/null; then envsubst "$VARS" < "$1"
  else python3 - "$1" <<'PY'
import os, re, sys
print(re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), m.group(0)), open(sys.argv[1]).read()), end="")
PY
  fi
}

OUT="$HERE/out"; rm -rf "$OUT"; mkdir -p "$OUT/nginx" "$OUT/systemd"
SITES="api"; [ "${SERVE_FRONTENDS:-yes}" = "yes" ] && SITES="customer vendor api"
for t in $SITES; do
  subst "$HERE/nginx/$t.conf.in" > "$OUT/nginx/$APP_NAME-$t.conf"
done
for t in api.service materialize.service materialize.timer backup.service backup.timer; do
  subst "$HERE/systemd/$t.in" > "$OUT/systemd/$APP_NAME-$t"
done
echo "Rendered into $OUT"

if [ "${1:-}" = "--install" ]; then
  [ "$(id -u)" = 0 ] || { echo "--install must run as root"; exit 1; }
  for f in "$OUT"/nginx/*.conf; do
    cp "$f" "/etc/nginx/sites-available/$(basename "$f" .conf)"
    ln -sf "/etc/nginx/sites-available/$(basename "$f" .conf)" "/etc/nginx/sites-enabled/$(basename "$f" .conf)"
  done
  cp "$OUT"/systemd/* /etc/systemd/system/
  systemctl daemon-reload
  nginx -t && systemctl reload nginx
  systemctl enable --now "$APP_NAME-api.service" "$APP_NAME-materialize.timer" "$APP_NAME-backup.timer"
  if [ "${SERVE_FRONTENDS:-yes}" = "yes" ]; then
    echo "Installed. Next: certbot --nginx -d $CUSTOMER_DOMAIN -d $VENDOR_DOMAIN -d $API_DOMAIN"
  else
    echo "Installed (API only). Next: certbot --nginx -d $API_DOMAIN"
  fi
fi
