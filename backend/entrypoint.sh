#!/bin/sh
# Applies any pending Alembic migrations, then starts the app. Runs on
# every container start, so a fresh /data volume gets initialized and an
# existing one gets brought up to date automatically — no manual step
# needed after `git pull` + rebuild.
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
