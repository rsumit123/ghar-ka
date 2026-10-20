from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, str_enum, utcnow
from app.models.enums import ComplaintStatus


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String(280), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[ComplaintStatus] = mapped_column(str_enum(ComplaintStatus), default=ComplaintStatus.open, index=True)
    admin_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
