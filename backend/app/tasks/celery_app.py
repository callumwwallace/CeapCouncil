from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "ceapcouncil",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.backtest", "app.tasks.competition"],
)

from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "expire-competitions": {
        "task": "app.tasks.competition.expire_competitions_task",
        "schedule": 3600.0,  # every hour
    },
    "activate-weekly-competitions": {
        "task": "app.tasks.competition.activate_weekly_competitions_task",
        "schedule": 3600.0,  # every hour (activates drafts when start_date arrives)
    },
    "promote-top-proposals": {
        "task": "app.tasks.competition.promote_top_proposals_task",
        "schedule": crontab(hour=0, minute=0, day_of_week=1),  # Every Monday midnight UTC
    },
}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max per backtest
    worker_prefetch_multiplier=1,
    task_default_retry_delay=60,
    task_acks_late=True,
)
