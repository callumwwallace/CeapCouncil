"""
SQLAlchemy type decorators for encrypted-at-rest columns.

Transparently encrypt on write and decrypt on read. Legacy plaintext
(stored without ENCv1 prefix) is passed through unchanged.
"""

from sqlalchemy import Text
from sqlalchemy.orm import Mapped
from sqlalchemy.types import TypeDecorator

from app.services.strategy_encryption import (
    decrypt_strategy_field,
    encrypt_strategy_field,
)


class EncryptedText(TypeDecorator[str]):
    """Text column that encrypts values at rest."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return encrypt_strategy_field(value)

    def process_result_value(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return decrypt_strategy_field(value)
