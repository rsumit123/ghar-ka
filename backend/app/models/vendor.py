from datetime import date, datetime

from sqlalchemy import Boolean, Date, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, str_enum, utcnow
from app.models.enums import FssaiStatus, MediaKind, ReviewStatus


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    story: Mapped[str] = mapped_column(String(280), default="")
    locality_id: Mapped[int | None] = mapped_column(ForeignKey("localities.id"), index=True)
    pincode: Mapped[str | None] = mapped_column(String(10), index=True)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    address_line: Mapped[str | None] = mapped_column(String(255))
    whatsapp_phone: Mapped[str | None] = mapped_column(String(20))
    review_status: Mapped[ReviewStatus] = mapped_column(
        str_enum(ReviewStatus), default=ReviewStatus.pending, index=True
    )
    review_note: Mapped[str | None] = mapped_column(Text)
    offers_pickup: Mapped[bool] = mapped_column(Boolean, default=True)
    delivery_radius_km: Mapped[float] = mapped_column(Float, default=0.0)  # 0 = no delivery
    live_override: Mapped[bool] = mapped_column(Boolean, default=False)
    live_override_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    media: Mapped[list["VendorMedia"]] = relationship(back_populates="vendor", cascade="all, delete-orphan")
    fssai: Mapped["FssaiRecord | None"] = relationship(
        back_populates="vendor", uselist=False, cascade="all, delete-orphan"
    )


class VendorMedia(Base):
    __tablename__ = "vendor_media"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    kind: Mapped[MediaKind] = mapped_column(str_enum(MediaKind))
    path: Mapped[str] = mapped_column(String(500))  # relative to UPLOAD_DIR/(public|private)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    vendor: Mapped[Vendor] = relationship(back_populates="media")


class FssaiRecord(Base):
    __tablename__ = "fssai_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), unique=True)
    status: Mapped[FssaiStatus] = mapped_column(str_enum(FssaiStatus), default=FssaiStatus.docs_pending, index=True)
    application_id: Mapped[str | None] = mapped_column(String(64))
    registration_number: Mapped[str | None] = mapped_column(String(64))
    issue_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    vendor: Mapped[Vendor] = relationship(back_populates="fssai")
