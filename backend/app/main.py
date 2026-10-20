"""FastAPI app factory. To add an API area: create app/routers/<name>.py exposing `router`, then add it to ROUTERS."""
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import (
    admin, auth, customer, feedback, geo, menu, payments, public, subscriptions, vendor, vendor_orders, vendor_plans,
)

API_PREFIX = "/api/v1"

# Every router listed here is mounted under API_PREFIX.
ROUTERS: list[APIRouter] = [
    public.router,
    auth.router,
    geo.router,
    vendor.router,
    menu.router,
    vendor_orders.router,
    vendor_plans.router,
    customer.router,
    payments.router,
    subscriptions.router,
    feedback.router,
    admin.router,
]


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=f"{settings.BRAND_NAME} API", docs_url="/api/docs", openapi_url="/api/openapi.json")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Requested-With"],
    )

    for router in ROUTERS:
        app.include_router(router, prefix=API_PREFIX)

    public_dir = Path(settings.UPLOAD_DIR) / "public"
    public_dir.mkdir(parents=True, exist_ok=True)
    (Path(settings.UPLOAD_DIR) / "private").mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=public_dir), name="media")
    return app


app = create_app()
