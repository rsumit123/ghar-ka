"""Server-side login sessions. Cookie carries a random token; DB keeps only its sha256."""
from datetime import timedelta

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import utcnow
from app.models import AuthSession, User
from app.services.security import new_token, sha256_hex


def create_session(db: Session, user: User) -> str:
    token = new_token()
    db.add(AuthSession(
        token_hash=sha256_hex(token),
        user_id=user.id,
        expires_at=utcnow() + timedelta(days=get_settings().SESSION_DAYS),
    ))
    db.commit()
    return token


def get_user_for_token(db: Session, token: str) -> User | None:
    row = db.execute(
        select(User).join(AuthSession, AuthSession.user_id == User.id).where(
            AuthSession.token_hash == sha256_hex(token), AuthSession.expires_at > utcnow()
        )
    ).scalar_one_or_none()
    return row


def delete_session(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == sha256_hex(token)))
    db.commit()


def delete_user_sessions(db: Session, user_id: int) -> None:
    """Instant revoke (suspension etc.)."""
    db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
    db.commit()


def set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.COOKIE_NAME, token, max_age=s.SESSION_DAYS * 86400, httponly=True,
        secure=s.cookie_secure, samesite="lax", domain=s.COOKIE_DOMAIN, path="/",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(s.COOKIE_NAME, domain=s.COOKIE_DOMAIN, path="/")
