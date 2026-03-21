from datetime import datetime
import re
from urllib.parse import urlparse

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: str | None = None

    @field_validator('username')
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v.lower()


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator('password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        from app.core.password import validate_password_strength
        valid, err = validate_password_strength(v)
        if not valid:
            raise ValueError(err or "Password is too weak")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., max_length=128)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        from app.core.password import validate_password_strength
        valid, err = validate_password_strength(v)
        if not valid:
            raise ValueError(err or "Password is too weak")
        return v


_AVATAR_ALLOWED_SCHEMES = {"http", "https"}


class UserUpdate(BaseModel):
    full_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None

    @field_validator('avatar_url')
    @classmethod
    def validate_avatar_url(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        try:
            parsed = urlparse(v)
        except Exception:
            raise ValueError("Invalid URL")
        if parsed.scheme not in _AVATAR_ALLOWED_SCHEMES:
            raise ValueError("Avatar URL must use http or https")
        if not parsed.netloc:
            raise ValueError("Avatar URL must include a domain")
        return v


class EmailChange(BaseModel):
    new_email: EmailStr
    current_password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        from app.core.password import validate_password_strength
        valid, err = validate_password_strength(v)
        if not valid:
            raise ValueError(err or "Password is too weak")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str | None
    bio: str | None
    avatar_url: str | None
    is_active: bool
    is_verified: bool
    is_superuser: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class UserPrivateResponse(UserResponse):
    email: EmailStr
    is_superuser: bool = False
    notify_on_mention: bool = True
    email_on_mention: bool = False
    email_marketing: bool = False

    class Config:
        from_attributes = True


class NotificationPreferencesUpdate(BaseModel):
    notify_on_mention: bool | None = None
    email_on_mention: bool | None = None
    email_marketing: bool | None = None
