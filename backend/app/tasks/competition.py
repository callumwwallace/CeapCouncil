"""Competition evaluation and badge tasks."""

from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.models.backtest import Backtest
from app.models.competition import Competition, CompetitionEntry, Badge, CompetitionStatus
from app.models.strategy import Strategy
from app.models.forum import ForumTopic, ForumThread, ForumPost
from app.models.user import User
from app.tasks.celery_app import celery_app
from app.tasks.backtest import run_backtest_task


sync_engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", ""))
SessionLocal = sessionmaker(bind=sync_engine)


VALID_METRICS = {"sharpe_ratio", "total_return", "calmar_ratio", "sortino_ratio", "win_rate", "max_drawdown"}


def _get_metric_value(entry: CompetitionEntry, metric: str) -> float | None:
    """Get the ranking metric value for an entry. Higher is better for comparison."""
    if metric not in VALID_METRICS:
        return None
    val = getattr(entry, metric, None)
    if val is None:
        return None
    # max_drawdown: lower (less negative) is better, so negate for ranking
    if metric == "max_drawdown":
        return -float(val)
    return float(val)


@celery_app.task(bind=True, time_limit=600)
def evaluate_competition_entry_task(self, entry_id: int):
    """Create backtest for a competition entry, run it, update entry with results, recompute ranks."""
    db = SessionLocal()
    try:
        entry = db.query(CompetitionEntry).filter(CompetitionEntry.id == entry_id).first()
        if not entry:
            return {"error": "Entry not found"}
        competition = db.query(Competition).filter(Competition.id == entry.competition_id).first()
        if not competition:
            return {"error": "Competition not found"}
        if competition.status != CompetitionStatus.ACTIVE:
            return {"error": "Competition is not active"}
        strategy = db.query(Strategy).filter(Strategy.id == entry.strategy_id).first()
        if not strategy:
            return {"error": "Strategy not found"}

        params = dict(strategy.parameters or {})
        params.setdefault("interval", "1d")
        params.setdefault("commission", 0.001)
        params.setdefault("slippage", 0.1)
        backtest = Backtest(
            symbol=competition.symbol,
            start_date=competition.backtest_start,
            end_date=competition.backtest_end,
            initial_capital=competition.initial_capital,
            parameters=params,
            slippage=0.001,
            commission=0.001,
            user_id=entry.user_id,
            strategy_id=entry.strategy_id,
        )
        db.add(backtest)
        db.commit()
        db.refresh(backtest)

        entry.backtest_id = backtest.id
        db.commit()

        run_backtest_task.apply(args=[backtest.id])
        db.expire_all()
        backtest = db.query(Backtest).filter(Backtest.id == backtest.id).first()

        if backtest.status.value == "completed":
            entry.total_return = backtest.total_return
            entry.sharpe_ratio = backtest.sharpe_ratio
            entry.max_drawdown = backtest.max_drawdown
            entry.win_rate = backtest.win_rate
            entry.sortino_ratio = backtest.sortino_ratio
            entry.calmar_ratio = backtest.calmar_ratio
            entry.total_trades = backtest.total_trades
        entry.evaluated_at = datetime.utcnow()
        db.commit()

        _recompute_ranks(db, competition.id)
        db.commit()
        return {"status": "completed", "entry_id": entry_id}
    except Exception as e:
        db.rollback()
        return {"status": "failed", "error": str(e)}
    finally:
        db.close()


def _get_ranking_metrics(competition: Competition) -> list[str]:
    """Resolve which metrics to use: ranking_metrics if non-empty, else single ranking_metric."""
    rm = competition.ranking_metrics
    if rm and isinstance(rm, list) and len(rm) >= 1:
        return [m for m in rm if m in VALID_METRICS]
    single = competition.ranking_metric or "sharpe_ratio"
    return [single] if single in VALID_METRICS else ["sharpe_ratio"]


def _recompute_ranks(db, competition_id: int):
    """Recompute ranks for all evaluated entries. Uses average rank when multiple metrics."""
    competition = db.query(Competition).filter(Competition.id == competition_id).first()
    if not competition:
        return
    metrics = _get_ranking_metrics(competition)
    entries = (
        db.query(CompetitionEntry)
        .filter(
            CompetitionEntry.competition_id == competition_id,
            CompetitionEntry.evaluated_at.isnot(None),
        )
        .all()
    )
    if not entries:
        return

    if len(metrics) == 1:
        # Single metric: score = metric value, higher is better
        metric = metrics[0]
        for entry in entries:
            entry.score = _get_metric_value(entry, metric)
        entries_with_score = [e for e in entries if e.score is not None]
        entries_with_score.sort(key=lambda e: e.score or float("-inf"), reverse=True)
        for rank, entry in enumerate(entries_with_score, 1):
            entry.rank = rank
        # Entries missing the metric get no rank
        for entry in entries:
            if entry not in entries_with_score:
                entry.rank = None
                entry.score = None
        return

    # Multi-metric: average of ranks. Lower avg_rank = better.
    n = len(entries)
    avg_ranks: list[tuple[float, CompetitionEntry]] = []
    for entry in entries:
        ranks: list[float] = []
        for metric in metrics:
            vals = [(e, _get_metric_value(e, metric)) for e in entries]
            vals_sorted = sorted(vals, key=lambda x: x[1] if x[1] is not None else float("-inf"), reverse=True)
            entry_to_rank = {e: i + 1 for i, (e, _) in enumerate(vals_sorted)}
            r = entry_to_rank.get(entry, n + 1)
            if _get_metric_value(entry, metric) is None:
                r = n + 1
            ranks.append(float(r))
        avg_r = sum(ranks) / len(ranks)
        avg_ranks.append((avg_r, entry))
    avg_ranks.sort(key=lambda x: x[0])
    for rank, (avg_r, entry) in enumerate(avg_ranks, 1):
        entry.rank = rank
        entry.score = -avg_r


@celery_app.task
def award_competition_badges_task(competition_id: int):
    """Award permanent badges to top performers when a competition completes."""
    db = SessionLocal()
    try:
        competition = db.query(Competition).filter(Competition.id == competition_id).first()
        if not competition or competition.status != CompetitionStatus.COMPLETED:
            return {"skipped": "Competition not completed"}

        entries = (
            db.query(CompetitionEntry)
            .filter(
                CompetitionEntry.competition_id == competition_id,
                CompetitionEntry.rank.isnot(None),
            )
            .order_by(CompetitionEntry.rank)
            .all()
        )

        title = competition.title
        for entry in entries:
            rank = entry.rank
            tier = "participant"
            if rank == 1:
                tier = "winner"
            elif rank <= 10:
                tier = "top_10"
            elif rank <= 25:
                tier = "top_25"

            existing = (
                db.query(Badge)
                .filter(
                    Badge.user_id == entry.user_id,
                    Badge.competition_id == competition_id,
                )
                .first()
            )
            if not existing:
                badge = Badge(
                    user_id=entry.user_id,
                    competition_id=competition_id,
                    competition_title=title,
                    badge_tier=tier,
                    rank=rank,
                )
                db.add(badge)
        db.commit()
        return {"awarded": len(entries)}
    finally:
        db.close()


def _format_entry_val(val) -> str:
    """Format a metric value for the table."""
    if val is None:
        return "—"
    if isinstance(val, float):
        if abs(val) >= 100 or (abs(val) < 0.01 and val != 0):
            return f"{val:.2e}"
        return f"{val:.2f}"
    return str(val)


def _build_archive_post_body(competition: Competition, top_entries: list) -> str:
    """Build markdown body for the archive thread."""
    parts = []

    if competition.description:
        parts.append(competition.description.strip())
        parts.append("")

    parts.append("## Competition details")
    parts.append("")
    parts.append(f"- **Symbol:** {competition.symbol}")
    parts.append(f"- **Backtest period:** {competition.backtest_start.strftime('%Y-%m-%d')} to {competition.backtest_end.strftime('%Y-%m-%d')}")
    parts.append(f"- **Entry period:** {competition.start_date.strftime('%Y-%m-%d')} to {competition.end_date.strftime('%Y-%m-%d')}")
    parts.append(f"- **Initial capital:** ${competition.initial_capital:,.0f}")
    parts.append(f"- **Ranking metric:** {competition.ranking_metric or 'sharpe_ratio'}")
    if competition.max_entries:
        parts.append(f"- **Max entries:** {competition.max_entries}")
    parts.append("")

    if competition.rules:
        parts.append("## Rules & requirements")
        parts.append("")
        for k, v in (competition.rules or {}).items():
            if v is not None and str(v).strip():
                parts.append(f"- **{k}:** {v}")
        parts.append("")

    if top_entries:
        parts.append("## Top 25 results")
        parts.append("")
        parts.append("| Rank | Username | Strategy | Score | Total Return | Sharpe | Max DD | Win Rate |")
        parts.append("|------|----------|----------|-------|--------------|--------|--------|----------|")
        for row in top_entries:
            entry, user, strategy = row
            rank = entry.rank or "—"
            username = user.username if user else "—"
            t = (strategy.title or "—") if strategy else "—"
            strat_title = (t[:30] + "…") if len(t) > 30 else t
            score = _format_entry_val(entry.score)
            tr = _format_entry_val(entry.total_return)
            sharpe = _format_entry_val(entry.sharpe_ratio)
            dd = _format_entry_val(entry.max_drawdown)
            wr = _format_entry_val(entry.win_rate)
            parts.append(f"| {rank} | {username} | {strat_title} | {score} | {tr} | {sharpe} | {dd} | {wr} |")
        parts.append("")

    return "\n".join(parts)


@celery_app.task
def post_competition_archive_task(competition_id: int):
    """Post a thread to Past Competition Archives when a competition completes."""
    db = SessionLocal()
    try:
        competition = db.query(Competition).filter(Competition.id == competition_id).first()
        if not competition or competition.status != CompetitionStatus.COMPLETED:
            return {"skipped": "Competition not completed"}

        topic = db.query(ForumTopic).filter(ForumTopic.slug == "archives").first()
        if not topic:
            return {"error": "Forum topic 'archives' not found"}

        top_entries = (
            db.query(CompetitionEntry, User, Strategy)
            .join(User, CompetitionEntry.user_id == User.id)
            .join(Strategy, CompetitionEntry.strategy_id == Strategy.id)
            .filter(
                CompetitionEntry.competition_id == competition_id,
                CompetitionEntry.rank.isnot(None),
            )
            .order_by(CompetitionEntry.rank)
            .limit(25)
            .all()
        )

        body = _build_archive_post_body(competition, top_entries)
        author_id = competition.created_by

        thread = ForumThread(
            topic_id=topic.id,
            author_id=author_id,
            title=competition.title[:200],
        )
        db.add(thread)
        db.flush()

        post = ForumPost(
            thread_id=thread.id,
            author_id=author_id,
            content=body,
        )
        db.add(post)
        db.commit()
        return {"thread_id": thread.id, "competition_id": competition_id}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def expire_competitions_task():
    """Check for competitions past end_date and auto-complete them."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        expired = (
            db.query(Competition)
            .filter(
                Competition.status == CompetitionStatus.ACTIVE,
                Competition.end_date <= now,
            )
            .all()
        )
        for comp in expired:
            comp.status = CompetitionStatus.COMPLETED
        db.commit()

        for comp in expired:
            award_competition_badges_task.delay(comp.id)
            post_competition_archive_task.delay(comp.id)

        return {"expired": len(expired), "ids": [c.id for c in expired]}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()
