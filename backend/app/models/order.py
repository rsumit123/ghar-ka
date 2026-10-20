from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, str_enum, utcnow
from app.models.enums import Fulfilment, OrderStatus, PaymentMethod, PaymentStatus, Slot


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_vendor_date_slot", "vendor_id", "date", "slot"),
        # Idempotent materialisation: one order per subscription per meal date.
        Index("uq_orders_subscription_date", "subscription_id", "date", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    date: Mapped[date] = mapped_column(Date)
    slot: Mapped[Slot] = mapped_column(str_enum(Slot))
    status: Mapped[OrderStatus] = mapped_column(str_enum(OrderStatus), default=OrderStatus.placed, index=True)
    fulfilment: Mapped[Fulfilment] = mapped_column(str_enum(Fulfilment))
    delivery_address: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    total: Mapped[int] = mapped_column(Integer)  # paise
    payment_method: Mapped[PaymentMethod] = mapped_column(str_enum(PaymentMethod), default=PaymentMethod.cod)
    payment_status: Mapped[PaymentStatus] = mapped_column(str_enum(PaymentStatus), default=PaymentStatus.pending)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(64), index=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("qty > 0", name="qty_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    offering_id: Mapped[int | None] = mapped_column(ForeignKey("menu_offerings.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(160))
    qty: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)  # paise

    order: Mapped[Order] = relationship(back_populates="items")
