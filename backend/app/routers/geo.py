from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import DbDep
from app.services import geo as geo_service

router = APIRouter(prefix="/geo", tags=["geo"])


class GeoHit(BaseModel):
    display_name: str
    lat: float
    lng: float


@router.get("/search", response_model=list[GeoHit])
def search(db: DbDep, q: Annotated[str, Query(min_length=3, max_length=200)]):
    try:
        return geo_service.search(db, q)
    except geo_service.GeoError as e:
        raise HTTPException(502, e.detail) from None


@router.get("/reverse", response_model=GeoHit)
def reverse(db: DbDep, lat: Annotated[float, Query(ge=-90, le=90)], lng: Annotated[float, Query(ge=-180, le=180)]):
    try:
        hit = geo_service.reverse(db, lat, lng)
    except geo_service.GeoError as e:
        raise HTTPException(502, e.detail) from None
    if hit is None:
        raise HTTPException(404, "No address found for that spot")
    return hit
