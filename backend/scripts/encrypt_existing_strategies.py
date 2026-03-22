#!/usr/bin/env python3
"""
Encrypt existing plaintext strategy code and descriptions at rest.

Run after deploying strategy encryption. Strategies are encrypted on first
write anyway; this script proactively encrypts all legacy plaintext so a
database dump alone cannot expose strategy code.

Usage:
    cd backend && python -m scripts.encrypt_existing_strategies

Set STRATEGY_ENCRYPTION_KEY in env (or it derives from SECRET_KEY).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.core.config import settings
from app.services.strategy_encryption import (
    encrypt_strategy_field,
    is_encryption_enabled,
)

_PREFIX = "ENCv1:"


def _is_plaintext(val: str | None) -> bool:
    return val is not None and val != "" and not val.startswith(_PREFIX)


def main() -> None:
    if not is_encryption_enabled():
        print("ERROR: Strategy encryption not enabled (check STRATEGY_ENCRYPTION_KEY)")
        sys.exit(1)

    url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(url)

    with engine.connect() as conn:
        # Strategies: code, description (raw read to get plaintext)
        r = conn.execute(text("SELECT id, code, description FROM strategies"))
        for row in r:
            id_, code, desc = row
            updates = []
            params = {}
            if _is_plaintext(code):
                updates.append("code = :code")
                params["code"] = encrypt_strategy_field(code)
            if desc and _is_plaintext(desc):
                updates.append("description = :description")
                params["description"] = encrypt_strategy_field(desc)
            if updates:
                params["id"] = id_
                conn.execute(
                    text("UPDATE strategies SET " + ", ".join(updates) + " WHERE id = :id"),
                    params,
                )
        conn.commit()

        # Strategy versions: code
        r = conn.execute(text("SELECT id, code FROM strategy_versions"))
        for row in r:
            id_, code = row
            if _is_plaintext(code):
                conn.execute(
                    text("UPDATE strategy_versions SET code = :code WHERE id = :id"),
                    {"code": encrypt_strategy_field(code), "id": id_},
                )
        conn.commit()

        # Backtests: inline code
        r = conn.execute(text("SELECT id, code FROM backtests WHERE code IS NOT NULL"))
        for row in r:
            id_, code = row
            if _is_plaintext(code):
                conn.execute(
                    text("UPDATE backtests SET code = :code WHERE id = :id"),
                    {"code": encrypt_strategy_field(code), "id": id_},
                )
        conn.commit()

    print("Done. Existing plaintext strategy fields have been encrypted.")


if __name__ == "__main__":
    main()
