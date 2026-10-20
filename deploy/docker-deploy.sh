#!/usr/bin/env bash
# Build and (re)start the API container on the shared VM (same pattern as the other projects there).
# Run on the VM from the git checkout:  sudo ./deploy/docker-deploy.sh
# One-time: /opt/gharka/backend.env must exist (copy backend/.env.example, set ENV=prod etc.).
set -euo pipefail
BASE=/opt/gharka
PORT=8065
cd "$BASE/app"
git fetch --quiet origin main && git reset --hard origin/main

docker tag gharka-backend:latest gharka-backend:previous 2>/dev/null || true
docker build -t gharka-backend backend

mkdir -p "$BASE/data/uploads"
docker rm -f gharka-backend 2>/dev/null || true
# Loopback only: nginx is the only way in (a bare -p would bypass TLS).
docker run -d --name gharka-backend --restart unless-stopped \
  -p 127.0.0.1:$PORT:8000 \
  --env-file "$BASE/backend.env" \
  -e DATABASE_URL=sqlite:////data/gharka.db \
  -e UPLOAD_DIR=/data/uploads \
  -v "$BASE/data:/data" \
  gharka-backend

sleep 4
curl -fsS "http://127.0.0.1:$PORT/api/v1/health" && echo && echo "gharka-backend is up on 127.0.0.1:$PORT"
