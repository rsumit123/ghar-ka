from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, str_enum, utcnow
from app.models.enums import Diet, Fulfilment, Slot, SubscriptionStatus


class TiffinPlan(Base):
    __tablename__ = "tiffin_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    slot: Mapped[Slot] = mapped_column(str_enum(Slot))
    days_of_week: Mapped[list[int]] = mapped_column(JSON, default=list)  # 0-6, Mon=0
    price_per_week: Mapped[int] = mapped_column(Integer)  # paise
    diet: Mapped[Diet] = mapped_column(str_enum(Diet), default=Diet.veg)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    cutoff_hours_before: Mapped[int] = mapped_column(Integer, default=12)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("tiffin_plans.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    weeks: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[SubscriptionStatus] = mapped_column(
        str_enum(SubscriptionStatus), default=SubscriptionStatus.active, index=True
    )
    paused_until: Mapped[date | None] = mapped_column(Date)
    fulfilment: Mapped[Fulfilment] = mapped_column(str_enum(Fulfilment))
    delivery_address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class SubscriptionSkip(Base):
    __tablename__ = "subscription_skips"
    __table_args__ = (UniqueConstraint("subscription_id", "date", name="uq_subscription_skips_sub_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
