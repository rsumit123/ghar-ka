#!/usr/bin/env bash
# Daily backup: consistent database snapshot + uploads (public AND private) -> one gzip'd tarball, pruned after N days.
# Uses `sqlite3 .backup` when the CLI exists, else Python's sqlite3 backup API. With BACKUP_PG_URL set, uses pg_dump.
# The tarball contains cooks' ID documents: it is chmod 600; encrypt before copying off the server.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_CONF="${DEPLOY_CONF:-$HERE/deploy.conf}"
[ -f "$DEPLOY_CONF" ] && . "$DEPLOY_CONF"
: "${APP_NAME:=gharka}" "${BACKUP_DIR:?set BACKUP_DIR}" "${UPLOAD_DIR:?set UPLOAD_DIR}" "${KEEP_BACKUP_DAYS:=14}"

TS="$(date +%Y%m%d-%H%M%S)"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/$APP_NAME-$TS.tar.gz"

if [ -n "${BACKUP_PG_URL:-}" ]; then
  pg_dump --no-owner --format=plain "$BACKUP_PG_URL" > "$STAGE/database.sql"
  DB_ITEM=database.sql
else
  : "${DB_FILE:?set DB_FILE}"
  DB_ITEM=database.sqlite3
  if command -v sqlite3 >/dev/null; then
    sqlite3 "$DB_FILE" ".backup '$STAGE/$DB_ITEM'"
  else
    python3 - "$DB_FILE" "$STAGE/$DB_ITEM" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PY
  fi
fi

umask 077
tar -czf "$OUT" -C "$STAGE" "$DB_ITEM" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Keep the newest KEEP_BACKUP_DAYS days.
find "$BACKUP_DIR" -maxdepth 1 -name "$APP_NAME-*.tar.gz" -mtime "+$KEEP_BACKUP_DAYS" -delete

# Optional off-site copy (uncomment one; configure the remote first):
# rclone copy "$OUT" remote:${APP_NAME}-backups/
# rsync -a "$OUT" backup-user@backup-host:/backups/${APP_NAME}/
