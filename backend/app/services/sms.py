"""SMS delivery. Add a real provider by implementing SmsProvider and registering it in PROVIDERS."""
import logging
from functools import lru_cache
from typing import Protocol

from app.config import get_settings

log = logging.getLogger("gharka.sms")


class SmsProvider(Protocol):
    def send(self, phone: str, message: str) -> None: ...


class ConsoleSmsProvider:
    """Dev provider: logs the message instead of sending it."""

    def send(self, phone: str, message: str) -> None:
        log.warning("SMS to %s: %s", phone, message)


PROVIDERS: dict[str, type] = {"console": ConsoleSmsProvider}


@lru_cache
def get_sms_provider() -> SmsProvider:
    """FastAPI dependency; tests override it with dependency_overrides."""
    name = get_settings().SMS_PROVIDER
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise RuntimeError(f"Unknown SMS_PROVIDER {name!r}; known: {', '.join(PROVIDERS)}") from None
