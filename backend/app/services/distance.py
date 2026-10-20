"""Great-circle distance and public coordinate rounding."""
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    dphi, dlmb = p2 - p1, radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def approx(v: float | None) -> float | None:
    """~110 m precision; what is shown publicly. Exact coordinates only go to admin."""
    return None if v is None else round(v, 3)
