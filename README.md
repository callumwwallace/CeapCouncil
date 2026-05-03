# Ceap Council

![Python](https://img.shields.io/badge/python-3.11+-blue)
![Next.js](https://img.shields.io/badge/next.js-16-black)

Ceap Council is a community platform for systematic traders to build, test, and compete with trading strategies, all in the browser and all at no expenses.

The idea is pretty straightforward you write a Python strategy, backtest it against real historical market data, then enter it into competitions against other people's strategies. There's a forum for sharing approaches, a leaderboard, and enough analytics to actually understand what your strategy is doing and why.

---

## What's inside

### Playground

This is the actual main part of the platform. You write Python strategies using the `StrategyBase` API, set your backtest parameters (symbols, date range, starting capital, commission model), and run it against data you select in the playground provided by yFinance API.

The order API covers market, limit, stop, stop-limit, and trailing stop orders, plus bracket orders and OCO pairs. For large position sizes there are execution algorithms TWAP, VWAP, iceberg, and POV. There's also a library of built in indicators, bar consolidators for resampling data, and a parameter optimizer if you want to tune parameters.

The engine handles the realistic stuff like slippage, spread simulation, PDT rules, margin requirements, and corporate actions. Results come back as an equity curve, trade log, and a full set of metrics: Sharpe, Sortino, Calmar, CAGR, alpha/beta, VaR/CVaR, rolling risk metrics, transaction cost breakdown, and a Deflated Sharpe Ratio to catch overfitting if you ran multiple trials.

### Lab

Where a users saved strategies live. You can organize them into named groups and can view code, past results, and fork anything straight into the Playground. Keeps your workspace tidy when you have a lot of experiments going on or in potential works in progress stages.

### Competitions

Time bound contests where every entrant uses the same symbols, date range, and starting capital. The playing field is level so your edge comes from the strategy itself. Winners get badges, top performers show up on the leaderboard, and once a competition wraps up it gets archived to the forum so people can see what worked and who place where so on with detail. Intended to keep competition and things competitive.

### Community and Forum

Strategy sharing with fork support, threaded discussion, voting, and mentions. If you find a strategy worth learning from you can fork it straight into your own playground if it is shared by a user to others. Post link to strategies and backtest results directly so the context is always there on a strategy or result set.

### Leaderboard and Feed

The leaderboard tracks competition performance across all users. The feed shows activity from people you follow new strategies, competition entries, and forum posts.

### User Profiles

Track your results, achievements, and competition history. You can follow other users part of the community and get notified when they post or enter something new. There's a reputation system builtin around community activity and competition performance (User influenced).

### Arena (STILL A WIP and MIGHT NOT HAPPEN)

Paper trading hub place where you can deploy strategies with live data and monitor P&L, positions, and order flow in real time.
(Potential issues with this would need a formal legal review before implementing)

---

## Usage

A simple moving average crossover to show the shape of a strategy:

```python
from app.engine.strategy.base import StrategyBase
from app.engine.indicators.overlays import SMA

class SMACrossover(StrategyBase):
    def on_init(self):
        self.fast = SMA(period=self.params.get("fast", 10))
        self.slow = SMA(period=self.params.get("slow", 30))
        self.set_warmup(30)

    def on_data(self, bar):
        self.fast.update(bar.close)
        self.slow.update(bar.close)

        if self.fast.value > self.slow.value and self.is_flat(bar.symbol):
            self.market_order(bar.symbol, quantity=10)
        elif self.fast.value < self.slow.value and self.is_long(bar.symbol):
            self.close_position(bar.symbol)
```

Paste this into the Playground, pick a symbol and date range, and hit Run.

---

## Tech stack

**Frontend:** Next.js 16 with App Router, React 19, TypeScript, Tailwind CSS 4. Monaco Editor handles the code editor, Recharts for charts, TanStack Query for data fetching, Zustand for state, NextAuth v4 for auth.

**Backend:** FastAPI on async Python, PostgreSQL with TimescaleDB for time series data, SQLAlchemy 2.0, Alembic for migrations. Celery and Redis handle background jobs for backtest runs, emails, and notifications. SlowAPI for rate limiting.

**Backtesting engine:** A custom event-driven simulation engine in Python. It streams bar data through a broker simulator with realistic fill models, supports multi-symbol portfolios, and calculates performance metrics. Market data comes from yfinance. Strategy code runs sandboxed and is encrypted at rest.

**Infrastructure:** Docker Compose for local dev and production, Nginx as a reverse proxy, S3/MinIO for media uploads.

---

## Project structure

```
/frontend          Next.js app (App Router)
  /src/app         Pages: playground, lab, arena, competitions, community, dashboard, leaderboard, feed, profile, admin
  /src/components  UI components (playground editor, forum, auth, layout)
  /src/stores      Zustand stores
  /src/hooks       Custom hooks
  /src/types       TypeScript definitions

/backend           FastAPI app
  /app/api/v1      REST endpoints (auth, strategies, backtests, competitions, forum, users, social)
  /app/engine      Backtesting engine (core loop, broker, data feeds, indicators, analytics)
  /app/models      SQLAlchemy models
  /app/schemas     Pydantic schemas
  /app/tasks       Celery background tasks
  /alembic         Database migrations

/docker            Dockerfiles for frontend and backend
/nginx             Nginx config
/docs              Documentation
/scripts           Helper scripts
```

---

## Getting started

### Prerequisites

- Node.js 22+
- Python 3.11+
- Docker and Docker Compose (recommended if you want everything running at once)
- PostgreSQL and Redis (or just let Docker handle them)

### With Docker

```bash
git clone https://github.com/your-org/QuantGuild.git
cd QuantGuild
docker compose up --build
```

Frontend at `http://localhost:3000`, API at `http://localhost:8000`.

### Without Docker

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Database migrations:**
```bash
cd backend
alembic upgrade head
```

**Celery worker:**
```bash
cd backend
celery -A app.tasks worker --loglevel=info
```

There's also a `Makefile` with shortcuts for all of the above if you have `make` available on ur system.

---

## Environment variables

Copy `.env.example` to `.env` in both `/frontend` and `/backend`. The key ones to set:

**Backend:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SECRET_KEY` - JWT signing key
- `ENCRYPTION_KEY` - Fernet key for encrypting strategy code at rest
- `EMAIL_*` - SMTP settings for transactional emails
- `AWS_*` / `MINIO_*` - Object storage for media uploads

**Frontend:**
- `NEXTAUTH_SECRET` - NextAuth signing secret
- `NEXTAUTH_URL` - Public URL of the frontend
- `NEXT_PUBLIC_API_URL` - URL of the backend API

---

## Roadmap

- **Arena** live paper trading with real-time data feeds
- More market data sources beyond yfinance
- Redesign UI for competitions with potential tournament system for competitions 
- Add notebook support for a research area (notebook sharing to community so on)
- Open to ideas from users also!

---

## License

© 2026 Callum Wallace. All rights reserved.
