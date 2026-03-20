"""Seed upcoming (draft) competitions. Run: python -m scripts.seed_upcoming_competitions

Useful when Celery hasn't run the weekly promote task yet, or for local dev.
Creates 5 draft competitions (from forum proposals if any, else all auto-generated).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.tasks.competition import promote_top_proposals_task

if __name__ == "__main__":
    result = promote_top_proposals_task()
    print("Result:", result)
