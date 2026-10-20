from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, str_enum, utcnow
from app.models.enums import Role


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("phone", "role", name="uq_users_phone_role"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[Role] = mapped_column(str_enum(Role), index=True)
    phone: Mapped[str | None] = mapped_column(String(20))  # E.164
    email: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120), default="")
    address_line: Mapped[str | None] = mapped_column(String(255))
    pincode: Mapped[str | None] = mapped_column(String(10))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    __table_args__ = (Index("ix_otp_codes_phone_created_at", "phone", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20))
    role: Mapped[Role] = mapped_column(str_enum(Role))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AuthSession(Base):
    """Login session. Cookie holds the raw token; only its sha256 is stored."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
