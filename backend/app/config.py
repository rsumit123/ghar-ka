"""Application settings. Every knob lives here and is overridable via env / backend/.env."""
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- general ---
    ENV: Literal["dev", "prod"] = "dev"
    BRAND_NAME: str = "gharka"
    DATABASE_URL: str = "sqlite:///./gharka.db"
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://localhost:5174"]

    # --- session cookie ---
    COOKIE_NAME: str = "gharka_session"
    COOKIE_DOMAIN: str | None = None  # ".skdev.one" in prod, unset locally
    COOKIE_SECURE: bool | None = None  # None -> True when ENV=prod, else False
    SESSION_DAYS: int = 30

    # --- SMS / OTP ---
    SMS_PROVIDER: str = "console"  # console | twilio_verify
    TWILIO_API_KEY_SID: str = ""
    TWILIO_API_KEY_SECRET: str = ""
    TWILIO_VERIFY_SERVICE_SID: str = ""
    OTP_LENGTH: int = 6
    OTP_TTL_MINUTES: int = 5
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RATE_LIMIT_COUNT: int = 3  # max OTP requests per phone ...
    OTP_RATE_LIMIT_WINDOW_MINUTES: int = 10  # ... within this window
    DEFAULT_COUNTRY_CODE: str = "+91"

    # --- uploads ---
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 8

    # --- time / slots ---
    APP_TIMEZONE: str = "Asia/Kolkata"
    LUNCH_START: str = "12:00"
    DINNER_START: str = "19:30"

    # --- discovery ---
    # Public listing shows vendors in the customer's pincode/locality, or within max(vendor delivery radius, this) km.
    PUBLIC_SEARCH_RADIUS_KM: float = 5.0

    # --- payments ---
    RAZORPAY_ENABLED: bool = False
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    RAZORPAY_API_URL: str = "https://api.razorpay.com/v1"
    # Online orders not paid within this many minutes are cancelled and their portions released.
    RAZORPAY_PAYMENT_TIMEOUT_MINUTES: int = 15

    # --- geocoding (OpenStreetMap Nominatim) ---
    NOMINATIM_URL: str = "https://nominatim.openstreetmap.org"
    NOMINATIM_USER_AGENT: str = "gharka-dev/0.1 (contact: admin@example.com)"
    GEO_COUNTRY: str = "in"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        # Accept comma-separated strings as well as JSON lists.
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json

                return json.loads(v)
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def cookie_secure(self) -> bool:
        return self.ENV == "prod" if self.COOKIE_SECURE is None else self.COOKIE_SECURE


@lru_cache
def get_settings() -> Settings:
    return Settings()
