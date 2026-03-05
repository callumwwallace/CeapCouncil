# ============================================================================
# Ceap Council Development Makefile
# ============================================================================
# This Makefile provides shortcuts for common development tasks.
# Run commands from the project root.
#
# Quick Start:
#   1. make up        - Start Docker services (PostgreSQL, Redis, MinIO)
#   2. make backend   - Start FastAPI server (in terminal tab 1)
#   3. make celery    - Start Celery worker (in terminal tab 2)
#   4. make frontend  - Start Next.js dev server (in terminal tab 3)
# ============================================================================

.PHONY: up down logs backend celery frontend dev stop reset install migrate migration

# ============================================================================
# DOCKER SERVICES
# These commands manage the infrastructure services running in Docker.
# Services: PostgreSQL (database), Redis (cache/queue), MinIO (file storage)
# ============================================================================

# Start all Docker services in detached mode (runs in background)
# Use this at the start of each development session
# Services will keep running until you stop them or restart your computer
up:
	docker compose -f docker-compose.dev.yml up -d

# Stop all Docker services (keeps data intact)
# Use this when you're done for the day to free up resources
# Your database data will persist for next time
down:
	docker compose -f docker-compose.dev.yml stop

# Stream live logs from all Docker services
# Useful for debugging database connection issues or seeing Redis activity
# Press Ctrl+C to stop viewing logs (services keep running)
logs:
	docker compose -f docker-compose.dev.yml logs -f

# DANGER: Completely reset all services and DELETE ALL DATA
# This removes all Docker volumes (database, Redis cache, uploaded files)
# Use when you want a completely fresh start or corrupted data
# You will lose: all users, strategies, backtests, uploaded files
reset:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d

# ============================================================================
# LOCAL DEVELOPMENT SERVERS
# These run YOUR code locally with hot-reload enabled.
# Each should run in a separate terminal tab.
# ============================================================================

# Start the FastAPI backend server with hot-reload
# - Runs on http://localhost:8000
# - API docs at http://localhost:8000/api/v1/docs
# - Auto-restarts when you edit any Python file in backend/
backend:
	cd backend && uvicorn app.main:app --reload

# Start the Celery background worker
# - Processes async tasks (backtests, emails, etc.)
# - Connects to Redis for task queue
# - Auto-restarts when you edit task files
# - Watch the output here to see backtest progress
celery:
	cd backend && celery -A app.tasks.celery_app:celery_app worker --loglevel=info

# Start the Next.js frontend development server
# - Runs on http://localhost:3000
# - Auto-refreshes browser when you edit React components
# - Shows build errors in terminal and browser
frontend:
	cd frontend && npm run dev

# ============================================================================
# SETUP & INSTALLATION
# Run these when setting up the project or after pulling new dependencies
# ============================================================================

# Install all dependencies for both backend and frontend
# Run this after cloning the repo or when requirements change
install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

# ============================================================================
# DATABASE MIGRATIONS
# Alembic manages database schema changes (adding tables, columns, etc.)
# ============================================================================

# Apply all pending database migrations
# Run this after pulling code that includes new migrations
# Safe to run multiple times - only applies new migrations
migrate:
	cd backend && alembic upgrade head

# Create a new migration from model changes
# Usage: make migration msg="add user avatar column"
# This auto-detects changes in your SQLAlchemy models and generates migration
# Always review the generated file in backend/alembic/versions/ before running migrate
migration:
	cd backend && alembic revision --autogenerate -m "$(msg)"
