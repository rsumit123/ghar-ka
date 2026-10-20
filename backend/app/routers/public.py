from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbDep
from app.models import Locality
from app.schemas.locality import LocalityOut

router = APIRouter(tags=["public"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/localities", response_model=list[LocalityOut])
def list_localities(db: DbDep):
    return db.scalars(select(Locality).order_by(Locality.city, Locality.name)).all()
