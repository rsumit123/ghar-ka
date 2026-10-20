"""Hashing helpers for tokens, OTPs and passwords."""
import hashlib
import hmac
import secrets

import bcrypt


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


_DUMMY_HASH = hash_password("not-a-real-password")


def verify_password(password: str, password_hash: str | None) -> bool:
    """Always does one bcrypt check so response time doesn't reveal whether the account exists."""
    try:
        ok = bcrypt.checkpw(password.encode()[:72], (password_hash or _DUMMY_HASH).encode())
    except ValueError:
        return False
    return ok and password_hash is not None
