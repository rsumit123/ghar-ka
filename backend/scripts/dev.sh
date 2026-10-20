#!/bin/sh
# Start the API with auto-reload on :8000. Uses backend/.venv if present, else `uv run`.
cd "$(dirname "$0")/.." || exit 1
if [ -x .venv/bin/uvicorn ]; then
  exec .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
else
  exec uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
fi
