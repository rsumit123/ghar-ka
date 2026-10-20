"""Nominatim proxy with DB cache (GeocodeCache), global 1 req/s throttle and short timeout."""
import re
import threading
import time

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GeocodeCache

TIMEOUT_S = 5.0
MIN_INTERVAL_S = 1.0  # Nominatim usage policy; tests set this to 0
LIMIT = 5

_lock = threading.Lock()
_last_call = 0.0


class GeoError(Exception):
    detail = "Map search is not available right now. Please try again in a moment."


def _throttle() -> None:
    global _last_call
    with _lock:
        wait = _last_call + MIN_INTERVAL_S - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def _get(path: str, params: dict) -> list | dict:
    s = get_settings()
    _throttle()
    try:
        r = httpx.get(
            f"{s.NOMINATIM_URL.rstrip('/')}/{path}",
            params={**params, "format": "jsonv2"},
            headers={"User-Agent": s.NOMINATIM_USER_AGENT, "Accept-Language": "en"},
            timeout=TIMEOUT_S,
        )
        r.raise_for_status()
        return r.json()
    except (httpx.HTTPError, ValueError):
        raise GeoError from None


def normalise_query(q: str) -> str:
    return re.sub(r"\s+", " ", q.strip().lower())[:200]


def search(db: Session, q: str) -> list[dict]:
    norm = normalise_query(q)
    prefix = f"s:{norm}#"
    cached = db.scalars(
        select(GeocodeCache).where(GeocodeCache.query.startswith(prefix, autoescape=True)).order_by(GeocodeCache.id)
    ).all()
    if cached:
        return [{"display_name": c.display_name, "lat": c.lat, "lng": c.lng} for c in cached]

    s = get_settings()
    raw = _get("search", {"q": q.strip(), "limit": LIMIT, "countrycodes": s.GEO_COUNTRY})
    results = []
    for item in raw if isinstance(raw, list) else []:
        try:
            results.append({"display_name": str(item["display_name"])[:500], "lat": float(item["lat"]), "lng": float(item["lon"])})
        except (KeyError, TypeError, ValueError):
            continue
    results = results[:LIMIT]
    for i, r in enumerate(results):
        db.add(GeocodeCache(query=f"{prefix}{i}", **r))
    if results:
        db.commit()
    return results


def reverse(db: Session, lat: float, lng: float) -> dict | None:
    key = f"r:{lat:.4f},{lng:.4f}"
    hit = db.scalar(select(GeocodeCache).where(GeocodeCache.query == key))
    if hit:
        return {"display_name": hit.display_name, "lat": hit.lat, "lng": hit.lng}
    raw = _get("reverse", {"lat": round(lat, 4), "lon": round(lng, 4), "zoom": 18})
    if not isinstance(raw, dict) or "display_name" not in raw:
        return None
    result = {"display_name": str(raw["display_name"])[:500], "lat": lat, "lng": lng}
    db.add(GeocodeCache(query=key, **result))
    db.commit()
    return result
