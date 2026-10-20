"""Shared FastAPI dependencies: db, auth, role guards, upload header check."""
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Role, User
from app.services.sessions import app_of, cookie_name, get_user_for_token

DbDep = Annotated[Session, Depends(get_db)]

CSRF_HEADER_VALUE = "gharka"  # multipart endpoints must send `X-Requested-With: gharka`


def get_session_token(request: Request) -> str | None:
    if app := app_of(request):
        return request.cookies.get(cookie_name(app))
    # No X-App header: plain links (admin document links on the vendor site) and API clients/tests.
    return request.cookies.get(cookie_name("vendor")) or request.cookies.get(cookie_name(None))


def get_optional_user(request: Request, db: DbDep) -> User | None:
    token = get_session_token(request)
    return get_user_for_token(db, token) if token else None


def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return user


def require_role(*roles: Role) -> Callable[..., User]:
    """Dependency factory: `user: User = Depends(require_role(Role.vendor))`."""

    def dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this")
        return user

    return dep


def require_xhr_header(x_requested_with: Annotated[str | None, Header()] = None) -> None:
    """Add to multipart upload endpoints (CSRF defence: browsers can't set this cross-site without CORS preflight)."""
    if x_requested_with != CSRF_HEADER_VALUE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing X-Requested-With header")


CurrentUser = Annotated[User, Depends(get_current_user)]
