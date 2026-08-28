# syntax=docker/dockerfile:1

# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Python backend + built frontend, single runtime image ----------
FROM python:3.12-slim
WORKDIR /app

# sqlite3 CLI is used by backup/backup.sh (run via `docker exec`) to take
# a consistent snapshot with `.backup` instead of copying the raw file.
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /frontend/dist ./static

RUN chmod +x entrypoint.sh

ENV DATABASE_URL=sqlite:////data/app.db
VOLUME ["/data"]
EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
