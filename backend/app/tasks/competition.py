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
from app.services.notifications import create_notification_sync


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

        symbols = competition.symbols if competition.symbols and len(competition.symbols) > 0 else [competition.symbol]
        results: list[dict] = []

        for sym in symbols:
            backtest = Backtest(
                symbol=sym,
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
            if entry.backtest_id is None:
                entry.backtest_id = backtest.id

            run_backtest_task.apply(args=[backtest.id])
            db.expire_all()
            bt = db.query(Backtest).filter(Backtest.id == backtest.id).first()
            if bt and bt.status and bt.status.value == "completed":
                results.append({
                    "total_return": bt.total_return,
                    "sharpe_ratio": bt.sharpe_ratio,
                    "max_drawdown": bt.max_drawdown,
                    "win_rate": bt.win_rate,
                    "sortino_ratio": bt.sortino_ratio,
                    "calmar_ratio": bt.calmar_ratio,
                    "total_trades": bt.total_trades,
                })

        if results:
            n = len(results)
            entry.total_return = sum(r["total_return"] or 0 for r in results) / n
            sr_vals = [r["sharpe_ratio"] for r in results if r.get("sharpe_ratio") is not None]
            entry.sharpe_ratio = sum(sr_vals) / len(sr_vals) if sr_vals else None
            entry.max_drawdown = sum(r["max_drawdown"] or 0 for r in results) / n
            entry.win_rate = sum(r["win_rate"] or 0 for r in results) / n
            so_vals = [r["sortino_ratio"] for r in results if r.get("sortino_ratio") is not None]
            entry.sortino_ratio = sum(so_vals) / len(so_vals) if so_vals else None
            ca_vals = [r["calmar_ratio"] for r in results if r.get("calmar_ratio") is not None]
            entry.calmar_ratio = sum(ca_vals) / len(ca_vals) if ca_vals else None
            entry.total_trades = int(sum(r["total_trades"] or 0 for r in results))

        entry.evaluated_at = datetime.utcnow()
        db.commit()

        _recompute_ranks(db, competition.id)
        db.commit()
        return {"status": "completed", "entry_id": entry_id}
    except Exception:
        db.rollback()
        logger.exception("Competition entry evaluation failed")
        return {"status": "failed", "error": "Evaluation failed"}
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
        awarded = 0
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
            if existing:
                # Update tier/rank if re-run (idempotent)
                existing.badge_tier = tier
                existing.rank = rank
            else:
                badge = Badge(
                    user_id=entry.user_id,
                    competition_id=competition_id,
                    competition_title=title,
                    badge_tier=tier,
                    rank=rank,
                )
                db.add(badge)
                awarded += 1

            # Notify entrant of final rank
            rank_msg = "1st" if rank == 1 else f"{rank}th"
            title_safe = title or ""
            create_notification_sync(
                db,
                entry.user_id,
                "competition_rank",
                f'Competition "{title_safe[:50]}{"..." if len(title_safe) > 50 else ""}" ended. You placed {rank_msg}!',
                f"/competitions/{competition_id}",
                category="competition",
                actor_id=None,
                extra_data={"competition_id": competition_id, "competition_title": title, "rank": rank},
            )

        db.commit()
        return {"awarded": awarded, "total_entries": len(entries)}
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


@celery_app.task(bind=True, max_retries=3, default_retry_delay=300)
def post_competition_archive_task(self, competition_id: int):
    """Post a thread to Past Competition Archives when a competition completes."""
    import logging
    logger = logging.getLogger(__name__)

    db = SessionLocal()
    try:
        competition = db.query(Competition).filter(Competition.id == competition_id).first()
        if not competition or competition.status != CompetitionStatus.COMPLETED:
            return {"skipped": "Competition not completed"}

        # Check for existing archive thread to prevent duplicates
        existing_archive = (
            db.query(ForumThread)
            .join(ForumTopic, ForumThread.topic_id == ForumTopic.id)
            .filter(
                ForumTopic.slug == "archives",
                ForumThread.title == competition.title[:200],
            )
            .first()
        )
        if existing_archive:
            return {"skipped": "Archive thread already exists", "thread_id": existing_archive.id}

        topic = db.query(ForumTopic).filter(ForumTopic.slug == "archives").first()
        if not topic:
            # Auto-create the archives topic
            topic = ForumTopic(
                slug="archives",
                name="Past Competition Archives",
                description="Archived results from completed competitions.",
                section="competitions",
                sort_order=99,
            )
            db.add(topic)
            db.flush()
            logger.info("Auto-created 'archives' forum topic (id=%s)", topic.id)

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
        system_user = db.query(User).filter(User.id == 1).first()
        author_id = system_user.id if system_user else competition.created_by

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
        logger.info("Archived competition %s as forum thread %s", competition_id, thread.id)
        return {"thread_id": thread.id, "competition_id": competition_id}
    except Exception as e:
        db.rollback()
        logger.error("Failed to archive competition %s: %s", competition_id, str(e))
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            return {"error": "Archive failed", "competition_id": competition_id, "retries_exhausted": True}
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
    except Exception:
        db.rollback()
        logger.exception("Expire competitions task failed")
        return {"error": "Task failed"}
    finally:
        db.close()


def _next_monday(now: datetime) -> datetime:
    """Return next Monday 00:00 UTC (the Monday of the upcoming competition week)."""
    from datetime import timedelta
    if now.weekday() == 0:  # Monday: next Monday is 7 days ahead
        d = now + timedelta(days=7)
    else:
        days_until = 7 - now.weekday()
        d = now + timedelta(days=days_until)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _generate_fallback_competitions(db, start_date: datetime, end_date: datetime, count: int, created_by: int) -> list[int]:
    """Generate count draft competitions from templates. Returns created competition IDs."""
    import random
    from dateutil.relativedelta import relativedelta

    created_ids = []
    now = datetime.utcnow()
    recent = db.query(Competition.title).filter(Competition.created_at >= now - relativedelta(weeks=8)).all()
    recent_titles = {r[0] for r in recent}

    templates = list(_PROPOSAL_TEMPLATES)
    random.shuffle(templates)
    for tmpl in templates:
        if len(created_ids) >= count:
            break
        symbol = random.choice(tmpl["symbols"])
        title = tmpl["title"].format(symbol=symbol)
        if title in recent_titles:
            continue
        recent_titles.add(title)
        end_dt = now - relativedelta(months=1)
        start_dt = end_dt - relativedelta(months=tmpl["period_months"])
        comp = Competition(
            title=title,
            description=tmpl["description"].format(symbol=symbol),
            symbol=symbol,
            backtest_start=start_dt,
            backtest_end=end_dt,
            start_date=start_date,
            end_date=end_date,
            initial_capital=tmpl["capital"],
            ranking_metric=tmpl.get("ranking_metric", "sharpe_ratio"),
            ranking_metrics=tmpl.get("ranking_metrics"),
            status=CompetitionStatus.DRAFT,
            created_by=created_by,
        )
        db.add(comp)
        db.flush()
        created_ids.append(comp.id)
    return created_ids


@celery_app.task
def promote_top_proposals_task():
    """Run weekly: promote top-voted forum proposal threads from LAST week into DRAFT competitions.

    Takes top 5 threads by vote_score from competition-ideas topic.
    Fills remaining slots (to 5 total) with auto-generated competitions.
    Creates as DRAFT; activate_weekly_competitions_task promotes to ACTIVE when start_date arrives.
    """
    from datetime import timedelta

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        start_date = _next_monday(now)
        end_date = start_date + timedelta(days=7)

        # Idempotency: skip if competitions already exist for this start_date
        existing_for_week = (
            db.query(Competition)
            .filter(
                Competition.start_date == start_date,
                Competition.status.in_([CompetitionStatus.DRAFT, CompetitionStatus.ACTIVE]),
            )
            .count()
        )
        if existing_for_week > 0:
            return {"skipped": "Competitions already exist for this week", "start_date": start_date.isoformat(), "existing": existing_for_week}

        topic = db.query(ForumTopic).filter(ForumTopic.slug == "competition-ideas").first()
        if not topic:
            # No forum topic — generate all 5 as fallback instead of silently returning 0
            system_user_id = 1
            generated_ids = _generate_fallback_competitions(db, start_date, end_date, 5, system_user_id)
            db.commit()
            return {"promoted": len(generated_ids), "from_proposals": 0, "competition_ids": generated_ids, "start_date": start_date.isoformat(), "warning": "competition-ideas topic not found, used fallbacks"}

        last_week_start = now - timedelta(days=7)
        last_week_end = now
        proposal_threads = (
            db.query(ForumThread)
            .filter(
                ForumThread.topic_id == topic.id,
                ForumThread.proposal_data.isnot(None),
                ForumThread.created_at >= last_week_start,
                ForumThread.created_at < last_week_end,
            )
            .order_by(ForumThread.vote_score.desc().nullslast())
            .limit(5)
            .all()
        )

        promoted = []
        for thr in proposal_threads:
            pd = thr.proposal_data
            if not pd or not isinstance(pd, dict):
                continue
            symbols = pd.get("symbols")
            symbol = pd.get("symbol")
            if symbols and isinstance(symbols, list) and len(symbols) > 0:
                symbol = symbols[0]
            backtest_start = pd.get("backtest_start")
            backtest_end = pd.get("backtest_end")
            if not all([symbol, backtest_start, backtest_end]):
                continue
            try:
                bs = datetime.strptime(backtest_start, "%Y-%m-%d")
                be = datetime.strptime(backtest_end, "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
            symbols_list = pd.get("symbols") if isinstance(pd.get("symbols"), list) and len(pd.get("symbols", [])) > 0 else [str(symbol).upper()]
            symbols_list = [str(s).upper() for s in symbols_list if s]
            comp = Competition(
                title=thr.title[:200],
                description=None,
                symbol=str(symbol).upper(),
                symbols=symbols_list if len(symbols_list) > 1 else None,
                backtest_start=bs,
                backtest_end=be,
                start_date=start_date,
                end_date=end_date,
                initial_capital=float(pd.get("initial_capital", 10000)),
                ranking_metric=pd.get("ranking_metric") or "sharpe_ratio",
                ranking_metrics=pd.get("ranking_metrics") if isinstance(pd.get("ranking_metrics"), list) else None,
                status=CompetitionStatus.DRAFT,
                created_by=thr.author_id,
            )
            db.add(comp)
            db.flush()
            promoted.append(comp.id)

            # Notify proposal author that their proposal was promoted
            if thr.author_id:
                thr_title = thr.title or ""
                create_notification_sync(
                    db,
                    thr.author_id,
                    "proposal_promoted",
                    f'Your proposal "{thr_title[:50]}{"..." if len(thr_title) > 50 else ""}" was promoted to a competition!',
                    f"/competitions/{comp.id}",
                    category="competition",
                    actor_id=None,
                    extra_data={"competition_id": comp.id, "competition_title": comp.title, "thread_id": thr.id},
                )

        fill_count = 5 - len(promoted)
        system_user_id = 1
        if fill_count > 0:
            generated_ids = _generate_fallback_competitions(db, start_date, end_date, fill_count, system_user_id)
            promoted.extend(generated_ids)

        db.commit()
        return {
            "promoted": len(promoted),
            "from_proposals": len(proposal_threads),
            "competition_ids": promoted,
            "start_date": start_date.isoformat(),
        }
    except Exception:
        db.rollback()
        logger.exception("Promote proposals task failed")
        return {"error": "Task failed"}
    finally:
        db.close()


# ─── Themed proposal templates for auto-generation ──────────────────

_PROPOSAL_TEMPLATES = [
    {
        "title": "Blue Chip Showdown — {symbol}",
        "description": "Classic large-cap challenge. Best risk-adjusted returns on {symbol} over the past year.",
        "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META"],
        "ranking_metric": "sharpe_ratio",
        "capital": 100000,
        "period_months": 12,
    },
    {
        "title": "Momentum Month — {symbol}",
        "description": "Pure momentum play. Highest total return on {symbol} in a short window wins.",
        "symbols": ["TSLA", "NVDA", "AMD", "COIN", "MSTR"],
        "ranking_metric": "total_return",
        "capital": 25000,
        "period_months": 3,
    },
    {
        "title": "Drawdown Survivor — {symbol}",
        "description": "Minimize your drawdown. The strategy that best weathers volatility on {symbol} wins.",
        "symbols": ["SPY", "QQQ", "IWM", "BTC-USD"],
        "ranking_metric": "max_drawdown",
        "capital": 50000,
        "period_months": 6,
    },
    {
        "title": "Crypto Gauntlet — {symbol}",
        "description": "Navigate crypto volatility. Best Sortino ratio on {symbol} takes the crown.",
        "symbols": ["BTC-USD", "ETH-USD", "SOL-USD"],
        "ranking_metric": "sortino_ratio",
        "capital": 10000,
        "period_months": 6,
    },
    {
        "title": "Balanced Returns — {symbol}",
        "description": "Multi-metric challenge: ranked by average of Sharpe, Return, and Win Rate on {symbol}.",
        "symbols": ["SPY", "QQQ", "AAPL", "MSFT"],
        "ranking_metrics": ["sharpe_ratio", "total_return", "win_rate"],
        "capital": 50000,
        "period_months": 12,
    },
    {
        "title": "Small Cap Sprint — {symbol}",
        "description": "Small caps, big moves. Best Calmar ratio on {symbol} wins.",
        "symbols": ["IWM", "ARKK", "XBI"],
        "ranking_metric": "calmar_ratio",
        "capital": 25000,
        "period_months": 6,
    },
    {
        "title": "Index Tracker — {symbol}",
        "description": "Beat the index. Highest return on {symbol} with reasonable risk.",
        "symbols": ["SPY", "DIA", "QQQ", "VTI"],
        "ranking_metric": "total_return",
        "capital": 100000,
        "period_months": 12,
    },
]


@celery_app.task
def activate_weekly_competitions_task():
    """Activate DRAFT competitions whose start_date has arrived."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        drafts = (
            db.query(Competition)
            .filter(
                Competition.status == CompetitionStatus.DRAFT,
                Competition.start_date <= now,
            )
            .all()
        )
        for comp in drafts:
            comp.status = CompetitionStatus.ACTIVE
        db.commit()
        return {"activated": len(drafts), "ids": [c.id for c in drafts]}
    except Exception:
        db.rollback()
        logger.exception("Activate weekly competitions task failed")
        return {"error": "Task failed"}
    finally:
        db.close()
