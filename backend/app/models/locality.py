from datetime import datetime

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utcnow


class Locality(Base):
    __tablename__ = "localities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(120))
    pincode: Mapped[str] = mapped_column(String(10), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    query: Mapped[str] = mapped_column(String(255), unique=True)  # normalised
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    display_name: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
