"""
Encryption at rest for strategy code and related fields.

Uses Fernet (AES-128-CBC) with a key from STRATEGY_ENCRYPTION_KEY or derived from SECRET_KEY.
Stores encrypted values with an ENCv1: prefix so legacy plaintext remains readable.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

logger = logging.getLogger(__name__)

_PREFIX = "ENCv1:"
_fernet: Fernet | None = None


def _get_fernet() -> Fernet | None:
    global _fernet
    if _fernet is not None:
        return _fernet
    key = settings.STRATEGY_ENCRYPTION_KEY
    if not key or not key.strip():
        derived = hashlib.sha256(
            (settings.SECRET_KEY + ":strategy").encode()
        ).digest()
        key = base64.urlsafe_b64encode(derived).decode()
    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception as e:
        logger.warning("Strategy encryption disabled: %s", e)
        return None


def encrypt_strategy_field(plain: str | None) -> str | None:
    """Encrypt a string for storage. Returns plaintext if encryption disabled."""
    if plain is None or plain == "":
        return plain
    f = _get_fernet()
    if not f:
        return plain
    try:
        return _PREFIX + f.encrypt(plain.encode()).decode()
    except Exception as e:
        logger.warning("Strategy encryption failed: %s", e)
        return plain


def decrypt_strategy_field(stored: str | None) -> str | None:
    """Decrypt a stored value. Returns as-is if not encrypted or decryption disabled."""
    if stored is None or stored == "":
        return stored
    if not stored.startswith(_PREFIX):
        return stored  # legacy plaintext
    f = _get_fernet()
    if not f:
        return stored
    try:
        return f.decrypt(stored[len(_PREFIX) :].encode()).decode()
    except InvalidToken:
        logger.warning("Strategy decryption failed (invalid token)")
        return stored
    except Exception as e:
        logger.warning("Strategy decryption failed: %s", e)
        return stored


def is_encryption_enabled() -> bool:
    """Return True if encryption is active (key available and valid)."""
    return _get_fernet() is not None
