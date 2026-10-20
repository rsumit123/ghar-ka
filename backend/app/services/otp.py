"""Phone OTP issue / verify. Codes are hashed (salted with phone+role), expire, and limit attempts."""
import secrets
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import utcnow
from app.models import OtpCode, Role, User
from app.services.security import constant_time_eq, sha256_hex
from app.services.sms import SmsProvider


class OtpError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _hash(phone: str, role: Role, code: str) -> str:
    return sha256_hex(f"{phone}:{role.value}:{code}")


def request_otp(db: Session, sms: SmsProvider, phone: str, role: Role) -> None:
    s = get_settings()
    now = utcnow()
    recent = db.scalar(
        select(func.count()).select_from(OtpCode).where(
            OtpCode.phone == phone,
            OtpCode.created_at > now - timedelta(minutes=s.OTP_RATE_LIMIT_WINDOW_MINUTES),
        )
    )
    if recent >= s.OTP_RATE_LIMIT_COUNT:
        raise OtpError("Too many codes requested. Please wait a few minutes and try again.", 429)
    code = "".join(str(secrets.randbelow(10)) for _ in range(s.OTP_LENGTH))
    # Invalidate older outstanding codes for this phone+role.
    db.execute(update(OtpCode).where(
        OtpCode.phone == phone, OtpCode.role == role, OtpCode.consumed_at.is_(None)
    ).values(consumed_at=now))
    db.add(OtpCode(
        phone=phone, role=role, code_hash=_hash(phone, role, code),
        expires_at=now + timedelta(minutes=s.OTP_TTL_MINUTES),
    ))
    db.commit()
    sms.send(phone, f"{s.BRAND_NAME}: your login code is {code}. Valid for {s.OTP_TTL_MINUTES} minutes.")


def verify_otp(db: Session, phone: str, role: Role, code: str) -> User:
    s = get_settings()
    now = utcnow()
    otp = db.execute(
        select(OtpCode).where(
            OtpCode.phone == phone, OtpCode.role == role,
            OtpCode.consumed_at.is_(None), OtpCode.expires_at > now,
        ).order_by(OtpCode.id.desc()).limit(1)
    ).scalar_one_or_none()
    if otp is None:
        raise OtpError("Code expired or not requested. Please request a new code.")
    if otp.attempts >= s.OTP_MAX_ATTEMPTS:
        raise OtpError("Too many wrong attempts. Please request a new code.", 429)
    otp.attempts += 1
    if not constant_time_eq(otp.code_hash, _hash(phone, role, code.strip())):
        db.commit()  # persist the attempt count
        raise OtpError("Wrong code. Please try again.")
    otp.consumed_at = now
    user = db.execute(select(User).where(User.phone == phone, User.role == role)).scalar_one_or_none()
    if user is None:
        user = User(role=role, phone=phone, name="")
        db.add(user)
    db.commit()
    return user
