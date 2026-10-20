from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.config import get_settings


def local_today() -> date:
    """Today's date in APP_TIMEZONE (used for FSSAI expiry checks)."""
    return datetime.now(ZoneInfo(get_settings().APP_TIMEZONE)).date()
