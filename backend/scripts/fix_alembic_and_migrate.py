#!/usr/bin/env python3
"""
Fix alembic_version if it points to a non-existent revision, then run migration.
Run from backend/: python scripts/fix_alembic_and_migrate.py
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.core.config import settings

def main():
    # Use sync URL (no asyncpg)
    url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(url)

    with engine.connect() as conn:
        # Get current version
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        row = result.fetchone()
        if row:
            current = row[0]
            print(f"Current alembic_version: {current}")

            # If it's the invalid p4d5e6f7a8b9 (typo for o4d5e6f7a8b9?), fix it
            if current == "p4d5e6f7a8b9":
                print("Fixing invalid revision (p4d5e6f7a8b9 -> 2321d8720ab2)")
                conn.execute(text("UPDATE alembic_version SET version_num = '2321d8720ab2'"))
                conn.commit()
                print("Done. Now run: alembic upgrade head")
        else:
            print("No alembic_version found. Run: alembic stamp 2321d8720ab2")
            print("Then: alembic upgrade head")

if __name__ == "__main__":
    main()
