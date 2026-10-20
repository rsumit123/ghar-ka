from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, str_enum, utcnow
from app.models.enums import Diet, Slot


class MenuOffering(Base):
    __tablename__ = "menu_offerings"
    __table_args__ = (
        Index("ix_menu_offerings_vendor_date_slot", "vendor_id", "date", "slot"),
        CheckConstraint("portions_sold >= 0 AND portions_sold <= portions_total", name="portions_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    slot: Mapped[Slot] = mapped_column(str_enum(Slot))
    dish_name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    photo_path: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[int] = mapped_column(Integer)  # paise
    diet: Mapped[Diet] = mapped_column(str_enum(Diet), default=Diet.veg)
    portions_total: Mapped[int] = mapped_column(Integer)
    portions_sold: Mapped[int] = mapped_column(Integer, default=0)
    cutoff_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
