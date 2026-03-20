import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    verify_password,
    verify_password_constant_time,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    blocklist_token,
    is_token_blocked,
)
from app.core.redis import redis_client
from app.core.email import send_email, send_verification_email, send_reset_email_body
from app.api.deps import get_current_active_user, oauth2_scheme
from app.models.user import User
from app.models.recovery_code import RecoveryCode
from app.services.totp import (
    encrypt_totp_secret,
    decrypt_totp_secret,
    generate_totp_secret,
    verify_totp,
    generate_recovery_codes,
    hash_recovery_code,
    verify_recovery_code,
    get_provisioning_uri,
)
from app.schemas.user import (
    UserCreate,
    UserResponse,
    VerifyEmailRequest,
    ResendVerificationRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.schemas.token import Token
from app.core.limiter import limiter

router = APIRouter()

_EMAIL_VERIFY_PREFIX = "email_verify:"
_EMAIL_VERIFY_TTL = 24 * 60 * 60  # 24 hours
_PWD_RESET_PREFIX = "pwd_reset:"
_PWD_RESET_TTL = 60 * 60  # 1 hour
_2FA_PENDING_PREFIX = "2fa_pending:"
_2FA_PENDING_TTL = 5 * 60  # 5 minutes


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class TOTPVerifyRequest(BaseModel):
    pending_token: str = Field(..., max_length=128)
    code: str = Field(..., max_length=32)


class TOTPConfirmRequest(BaseModel):
    code: str


class TOTPDisableRequest(BaseModel):
    password: str
    code: str


class TOTPRegenerateRequest(BaseModel):
    password: str


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_in.email))
    email_taken = result.scalar_one_or_none() is not None

    result = await db.execute(select(User).where(User.username == user_in.username.lower()))
    username_taken = result.scalar_one_or_none() is not None

    if email_taken or username_taken:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Email or username may already be in use.",
        )

    user = User(
        email=user_in.email,
        username=user_in.username,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = secrets.token_urlsafe(32)
    await redis_client.setex(
        f"{_EMAIL_VERIFY_PREFIX}{token}",
        _EMAIL_VERIFY_TTL,
        str(user.id),
    )
    html = send_verification_email(user_in.email, token)
    await send_email(user_in.email, "Verify your QuantGuild email", html)

    return user


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not verify_password_constant_time(
        form_data.password, user.hashed_password if user else None
    ) or not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"requires_verification": True, "message": "Please verify your email before logging in"},
        )

    if user.totp_enabled:
        pending_token = secrets.token_urlsafe(32)
        await redis_client.setex(
            f"{_2FA_PENDING_PREFIX}{pending_token}",
            _2FA_PENDING_TTL,
            str(user.id),
        )
        return {"requires_2fa": True, "pending_token": pending_token}

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


def _safe_user_id(raw: str | None) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


@router.post("/verify-email", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def verify_email(request: Request, body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    key = f"{_EMAIL_VERIFY_PREFIX}{body.token}"
    user_id = await redis_client.get(key)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")
    await redis_client.delete(key)
    uid = _safe_user_id(user_id.decode() if isinstance(user_id, bytes) else user_id)
    if uid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")

    user.is_verified = True
    await db.commit()
    return {"message": "Email verified successfully"}


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
@limiter.limit("3/hour")
async def resend_verification(request: Request, body: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"message": "If an account exists with this email, a verification link has been sent"}
    if user.is_verified:
        return {"message": "Email is already verified"}

    token = secrets.token_urlsafe(32)
    await redis_client.setex(f"{_EMAIL_VERIFY_PREFIX}{token}", _EMAIL_VERIFY_TTL, str(user.id))
    html = send_verification_email(user.email, token)
    await send_email(user.email, "Verify your QuantGuild email", html)
    return {"message": "If an account exists with this email, a verification link has been sent"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user:
        token = secrets.token_urlsafe(32)
        await redis_client.setex(
            f"{_PWD_RESET_PREFIX}{token}",
            _PWD_RESET_TTL,
            str(user.id),
        )
        html = send_reset_email_body(user.email, token)
        await send_email(user.email, "Reset your QuantGuild password", html)
    return {"message": "If an account exists with this email, a password reset link has been sent"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    key = f"{_PWD_RESET_PREFIX}{body.token}"
    user_id = await redis_client.get(key)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )
    await redis_client.delete(key)
    uid = _safe_user_id(user_id.decode() if isinstance(user_id, bytes) else user_id)
    if uid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token",
        )

    from datetime import datetime, timezone

    user.hashed_password = get_password_hash(body.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Password has been reset successfully"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    body: LogoutRequest | None = None,
    token: str = Depends(oauth2_scheme),
    _current_user: User = Depends(get_current_active_user),
):
    await blocklist_token(token)
    if body and body.refresh_token:
        await blocklist_token(body.refresh_token)


@router.post("/refresh", response_model=Token)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            body.refresh_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        if payload.get("type") != "refresh":
            raise credentials_exception
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        if await is_token_blocked(payload):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    uid = _safe_user_id(user_id)
    if uid is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exception

    await blocklist_token(body.refresh_token)

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


# ----- TOTP 2FA -----

totp_router = APIRouter(prefix="/totp", tags=["totp"])


@totp_router.get("/status")
async def totp_status(current_user: User = Depends(get_current_active_user)):
    return {"totp_enabled": current_user.totp_enabled}


@totp_router.post("/setup")
@limiter.limit("10/minute")
async def totp_setup(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is already enabled")

    secret = generate_totp_secret()
    encrypted = encrypt_totp_secret(secret)
    current_user.totp_secret_encrypted = encrypted
    await db.commit()

    uri = get_provisioning_uri(secret, current_user.email)
    return {"qr_uri": uri, "secret": secret}


@totp_router.post("/confirm")
@limiter.limit("10/minute")
async def totp_confirm(
    request: Request,
    body: TOTPConfirmRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA setup not started")
    if current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is already enabled")

    secret = decrypt_totp_secret(current_user.totp_secret_encrypted)
    if not verify_totp(secret, body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code")

    current_user.totp_enabled = True
    codes = generate_recovery_codes(10)
    for code in codes:
        rc = RecoveryCode(user_id=current_user.id, code_hash=hash_recovery_code(code))
        db.add(rc)
    await db.commit()

    return {"recovery_codes": codes, "message": "2FA enabled. Save your recovery codes in a safe place."}


@totp_router.post("/verify")
@limiter.limit("20/minute")
async def totp_verify(
    request: Request,
    body: TOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    key = f"{_2FA_PENDING_PREFIX}{body.pending_token}"
    user_id = await redis_client.get(key)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired 2FA session")

    await redis_client.delete(key)
    uid = _safe_user_id(user_id.decode() if isinstance(user_id, bytes) else user_id)
    if uid is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA session")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA session")

    code = body.code.strip()

    if len(code) == 6 and code.isdigit():
        if not user.totp_secret_encrypted:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2FA not configured")
        secret = decrypt_totp_secret(user.totp_secret_encrypted)
        if not verify_totp(secret, code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid verification code")
    else:
        from sqlalchemy import and_
        rc_result = await db.execute(
            select(RecoveryCode).where(
                and_(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
            )
        )
        recovery_codes = rc_result.scalars().all()
        from datetime import datetime, timezone
        matched = False
        for rc in recovery_codes:
            if verify_recovery_code(code, rc.code_hash):
                rc.used_at = datetime.now(timezone.utc)
                matched = True
                break
        if not matched:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid recovery code")
        await db.commit()

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@totp_router.post("/disable")
@limiter.limit("10/minute")
async def totp_disable(
    request: Request,
    body: TOTPDisableRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")

    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA not configured")

    secret = decrypt_totp_secret(current_user.totp_secret_encrypted)
    if not verify_totp(secret, body.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid verification code")

    current_user.totp_secret_encrypted = None
    current_user.totp_enabled = False
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == current_user.id))
    await db.commit()

    return {"message": "2FA has been disabled"}


@totp_router.post("/regenerate-recovery-codes")
@limiter.limit("5/hour")
async def totp_regenerate_recovery_codes(
    request: Request,
    body: TOTPRegenerateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")

    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == current_user.id))
    codes = generate_recovery_codes(10)
    for code in codes:
        rc = RecoveryCode(user_id=current_user.id, code_hash=hash_recovery_code(code))
        db.add(rc)
    await db.commit()

    return {"recovery_codes": codes, "message": "New recovery codes generated. Old codes are invalidated."}


router.include_router(totp_router)
