FROM python:3.12-slim

WORKDIR /app

# Dependencies first so this layer caches until pyproject changes.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install --no-cache-dir . && rm -rf app

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

# SQLite database and uploads live on a mounted volume at /data (see deploy/docker-deploy.sh).
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'"]
