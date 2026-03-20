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
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


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
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str | None
    bio: str | None
    avatar_url: str | None
    is_active: bool
    is_verified: bool
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
