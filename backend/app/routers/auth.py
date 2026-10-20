from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbDep, get_session_token
from app.models import Role, User
from app.schemas.auth import AdminLogin, OkOut, OtpRequest, OtpVerify, UserOut
from app.services import otp as otp_service
from app.services.security import verify_password
from app.services.sessions import clear_session_cookie, create_session, delete_session, set_session_cookie
from app.services.sms import SmsProvider, get_sms_provider

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/otp/request", response_model=OkOut)
def otp_request(body: OtpRequest, db: DbDep, sms: Annotated[SmsProvider, Depends(get_sms_provider)]):
    try:
        otp_service.request_otp(db, sms, body.phone, body.role)
    except otp_service.OtpError as e:
        raise HTTPException(e.status_code, e.detail) from None
    return OkOut()


@router.post("/otp/verify", response_model=UserOut)
def otp_verify(body: OtpVerify, response: Response, db: DbDep):
    try:
        user = otp_service.verify_otp(db, body.phone, body.role, body.code)
    except otp_service.OtpError as e:
        raise HTTPException(e.status_code, e.detail) from None
    set_session_cookie(response, create_session(db, user))
    return user


@router.post("/admin/login", response_model=UserOut)
def admin_login(body: AdminLogin, response: Response, db: DbDep):
    user = db.execute(
        select(User).where(User.role == Role.admin, User.email == body.email.strip().lower())
    ).scalar_one_or_none()
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    set_session_cookie(response, create_session(db, user))
    return user


@router.post("/logout", response_model=OkOut)
def logout(request: Request, response: Response, db: DbDep):
    if token := get_session_token(request):
        delete_session(db, token)
    clear_session_cookie(response)
    return OkOut()


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
