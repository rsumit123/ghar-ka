"""SMS delivery. Add a real provider by implementing SmsProvider and registering it in PROVIDERS.

A provider with `verifies_codes = True` (Twilio Verify) generates and checks the code itself: otp.py then calls
`start(phone)` / `check(phone, code)` instead of `send(...)` and its own hash comparison.
"""
import logging
from functools import lru_cache
from typing import Protocol

import httpx

from app.config import get_settings

log = logging.getLogger("gharka.sms")


class SmsProvider(Protocol):
    def send(self, phone: str, message: str) -> None: ...


class ConsoleSmsProvider:
    """Dev provider: logs the message instead of sending it."""

    def send(self, phone: str, message: str) -> None:
        log.warning("SMS to %s: %s", phone, message)


class SmsError(Exception):
    pass


class TwilioVerifyProvider:
    """Twilio Verify (SMS channel). Auth is an API key SID + secret (or the account SID + auth token)."""

    verifies_codes = True
    BASE = "https://verify.twilio.com/v2/Services"

    def __init__(self) -> None:
        s = get_settings()
        if not (s.TWILIO_API_KEY_SID and s.TWILIO_API_KEY_SECRET and s.TWILIO_VERIFY_SERVICE_SID):
            raise RuntimeError("SMS_PROVIDER=twilio_verify needs TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_VERIFY_SERVICE_SID")
        self.auth = (s.TWILIO_API_KEY_SID, s.TWILIO_API_KEY_SECRET)
        self.url = f"{self.BASE}/{s.TWILIO_VERIFY_SERVICE_SID}"

    def _post(self, path: str, data: dict) -> httpx.Response:
        try:
            return httpx.post(f"{self.url}/{path}", data=data, auth=self.auth, timeout=10)
        except httpx.HTTPError as e:
            raise SmsError(f"Twilio unreachable: {e}") from None

    def start(self, phone: str) -> None:
        r = self._post("Verifications", {"To": phone, "Channel": "sms"})
        if r.status_code >= 400:
            log.error("Twilio Verify start failed for %s: %s %s", phone, r.status_code, r.text[:300])
            raise SmsError("Could not send the code")

    def check(self, phone: str, code: str) -> bool:
        r = self._post("VerificationCheck", {"To": phone, "Code": code})
        if r.status_code == 404:  # no pending verification (expired, already approved or too many attempts)
            return False
        if r.status_code >= 400:
            log.error("Twilio Verify check failed for %s: %s %s", phone, r.status_code, r.text[:300])
            raise SmsError("Could not check the code")
        return r.json().get("status") == "approved"

    def send(self, phone: str, message: str) -> None:
        raise NotImplementedError("Twilio Verify sends its own message; use start()")


PROVIDERS: dict[str, type] = {"console": ConsoleSmsProvider, "twilio_verify": TwilioVerifyProvider}


@lru_cache
def get_sms_provider() -> SmsProvider:
    """FastAPI dependency; tests override it with dependency_overrides."""
    name = get_settings().SMS_PROVIDER
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise RuntimeError(f"Unknown SMS_PROVIDER {name!r}; known: {', '.join(PROVIDERS)}") from None
