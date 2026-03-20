import base64
import hashlib
import secrets
import string

from cryptography.fernet import Fernet
from passlib.context import CryptContext
import pyotp

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _get_fernet() -> Fernet:
    key = settings.TOTP_ENCRYPTION_KEY
    if not key:
        derived = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        key = base64.urlsafe_b64encode(derived).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_totp_secret(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_totp_secret(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def verify_totp(secret: str, code: str, valid_window: int = 1) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=valid_window)


def generate_recovery_codes(count: int = 10) -> list[str]:
    chars = string.ascii_uppercase + string.digits
    codes = []
    for _ in range(count):
        parts = ["".join(secrets.choice(chars) for _ in range(4)) for _ in range(2)]
        codes.append("-".join(parts))
    return codes


def hash_recovery_code(code: str) -> str:
    return pwd_context.hash(code)


def verify_recovery_code(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=settings.TOTP_ISSUER_NAME,
    )
