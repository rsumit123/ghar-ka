"""Phone number normalisation to E.164."""
import re

from app.config import get_settings


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str, default_cc: str | None = None) -> str:
    """Return E.164 (e.g. +919876543210). Bare 10-digit / 0-prefixed numbers get the default country code."""
    cc = (default_cc or get_settings().DEFAULT_COUNTRY_CODE).lstrip("+")
    s = re.sub(r"[\s\-().]", "", raw or "")
    if s.startswith("00"):
        s = "+" + s[2:]
    if s.startswith("+"):
        digits = s[1:]
    else:
        digits = s
        if len(digits) == 11 and digits.startswith("0"):
            digits = cc + digits[1:]
        elif len(digits) == 10:
            digits = cc + digits
        elif not (digits.startswith(cc) and len(digits) > len(cc)):
            raise InvalidPhone("Enter a valid phone number")
    if not digits.isdigit() or not 8 <= len(digits) <= 15 or digits.startswith("0"):
        raise InvalidPhone("Enter a valid phone number")
    if digits.startswith("91") and len(digits) == 12 and digits[2] not in "6789":
        raise InvalidPhone("Enter a valid Indian mobile number")
    return "+" + digits


def digits_only(phone: str | None) -> str:
    """Digits of an E.164 number without '+', as used in wa.me links."""
    return re.sub(r"\D", "", phone or "")
