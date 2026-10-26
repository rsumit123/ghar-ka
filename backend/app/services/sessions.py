"""Server-side login sessions. Cookie carries a random token; DB keeps only its sha256."""
from datetime import timedelta

from fastapi import Request, Response
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


# Each site sends `X-App: customer|vendor|admin` and gets its own cookie, so being a cook on the vendor site, a customer on
# the customer site and the admin under /admin (all on the shared COOKIE_DOMAIN) don't overwrite each other.
# No header -> the plain COOKIE_NAME.
APPS = ("customer", "vendor", "admin")


def app_of(request: Request) -> str | None:
    app = request.headers.get("x-app")
    return app if app in APPS else None


def cookie_name(app: str | None) -> str:
    name = get_settings().COOKIE_NAME
    return f"{name}_{app}" if app else name


def set_session_cookie(response: Response, token: str, app: str | None = None) -> None:
    s = get_settings()
    response.set_cookie(
        cookie_name(app), token, max_age=s.SESSION_DAYS * 86400, httponly=True,
        secure=s.cookie_secure, samesite="lax", domain=s.COOKIE_DOMAIN, path="/",
    )


def clear_session_cookie(response: Response, app: str | None = None) -> None:
    s = get_settings()
    response.delete_cookie(cookie_name(app), domain=s.COOKIE_DOMAIN, path="/")
