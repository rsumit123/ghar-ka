from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbDep, get_session_token
from app.models import Role, User
from app.config import get_settings
from app.schemas.auth import AdminLogin, AuthConfigOut, OkOut, OtpRequest, OtpVerify, PasswordLogin, UserOut
from app.services import otp as otp_service
from app.services.security import constant_time_eq, verify_password
from app.services.sessions import app_of, clear_session_cookie, create_session, delete_session, set_session_cookie
from app.services.sms import SmsProvider, get_sms_provider

router = APIRouter(prefix="/auth", tags=["auth"])


INVITE_ONLY = "We're invite only for now. Ask us for an invite to get your login."


def _password_mode() -> bool:
    return get_settings().AUTH_MODE in ("password", "shared_password")


@router.get("/config", response_model=AuthConfigOut)
def auth_config():
    return AuthConfigOut(mode="password" if _password_mode() else "otp")


@router.post("/password/login", response_model=UserOut)
def password_login(body: PasswordLogin, request: Request, response: Response, db: DbDep):
    if not _password_mode():
        raise HTTPException(404, "Password login is off")
    user = db.execute(select(User).where(User.phone == body.phone, User.role == body.role)).scalar_one_or_none()
    s = get_settings()
    if s.AUTH_MODE == "shared_password":
        if not s.SHARED_LOGIN_PASSWORD or not constant_time_eq(body.password, s.SHARED_LOGIN_PASSWORD):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong mobile number or password")
        if user is None:
            user = User(role=body.role, phone=body.phone, name="")
            db.add(user)
            db.commit()
        set_session_cookie(response, create_session(db, user), app_of(request))
        return user
    # verify_password runs bcrypt even without a user, so unknown numbers take as long as wrong passwords
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong mobile number or password")
    set_session_cookie(response, create_session(db, user), app_of(request))
    return user


@router.post("/otp/request", response_model=OkOut)
def otp_request(body: OtpRequest, db: DbDep, sms: Annotated[SmsProvider, Depends(get_sms_provider)]):
    if _password_mode():
        raise HTTPException(403, INVITE_ONLY)
    try:
        otp_service.request_otp(db, sms, body.phone, body.role)
    except otp_service.OtpError as e:
        raise HTTPException(e.status_code, e.detail) from None
    return OkOut()


@router.post("/otp/verify", response_model=UserOut)
def otp_verify(body: OtpVerify, request: Request, response: Response, db: DbDep):
    if _password_mode():
        raise HTTPException(403, INVITE_ONLY)
    try:
        user = otp_service.verify_otp(db, body.phone, body.role, body.code)
    except otp_service.OtpError as e:
        raise HTTPException(e.status_code, e.detail) from None
    set_session_cookie(response, create_session(db, user), app_of(request))
    return user


@router.post("/admin/login", response_model=UserOut)
def admin_login(body: AdminLogin, request: Request, response: Response, db: DbDep):
    user = db.execute(
        select(User).where(User.role == Role.admin, User.email == body.email.strip().lower())
    ).scalar_one_or_none()
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    set_session_cookie(response, create_session(db, user), app_of(request))
    return user


@router.post("/logout", response_model=OkOut)
def logout(request: Request, response: Response, db: DbDep):
    if token := get_session_token(request):
        delete_session(db, token)
    clear_session_cookie(response, app_of(request))
    return OkOut()


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
