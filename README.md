# Business Administration

[![CI](https://github.com/Feardrop/business-administration/actions/workflows/ci.yaml/badge.svg)](https://github.com/Feardrop/business-administration/actions/workflows/ci.yaml)

Self-hosted tool for invoices, expenses, and an EÜR (income surplus
statement) preview for a small German business (Kleingewerbe,
Kleinunternehmerregelung §19 UStG). React + TypeScript + FastAPI +
SQLite, all in one Docker container.

Does not replace tax advice.

## Quickstart (Docker)

**Option A — build from source:**
```bash
git clone <this-repo> business-administration
cd business-administration
docker compose up -d --build
```

**Option B — prebuilt image from GHCR:**

Every version from `v0.1.0` onward is pushed automatically to
`ghcr.io/feardrop/business-administration` on release (tags `vX.Y.Z`
and `latest`) — see `.github/workflows/cd.yaml`. As long as the repo is
private, the image is private too; log in once with a
[Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
that has the `read:packages` scope:
```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin
docker pull ghcr.io/feardrop/business-administration:latest
```
Then replace `docker-compose.yml`'s `build: .` with `image:
ghcr.io/feardrop/business-administration:latest` (or use your own
compose file without a build step) and run `docker compose up -d` — no
local checkout, no build.

Then open in your browser: `http://<home-server-ip>:8000`

The database is a single file at `./data/app.db` on the host (bind
mount) — so it survives container restarts and updates. Tables are
created automatically on first start (no manual migration step
needed).

First thing to do: enter your business details under **Settings**
(name, address, tax number) — these appear on every invoice.

The UI is available in German and English (switcher at the bottom of
the sidebar). The printed invoice document itself always stays in
German regardless of that setting, since it's a legally binding
document under German tax law. See `docs/i18n.md` for how the i18n
setup works if you're extending the UI.

## Applying updates

```bash
git pull
docker compose up -d --build
```

New database migrations (if any) run automatically on container start
(`backend/entrypoint.sh` runs `alembic upgrade head` before starting
the server).

## Backups to pCloud

Backups use [`rclone`](https://rclone.org) with pCloud as the remote.

**One-time setup** (on the host, not inside the container):
```bash
# install rclone, e.g.:
curl https://rclone.org/install.sh | sudo bash

# set up the pCloud remote (follows the browser OAuth flow):
rclone config
# -> "n" (new remote) -> name: pcloud -> type: pcloud -> accept the defaults for the rest
```

**Create a backup:**
```bash
./backup/backup.sh
```
The script takes a consistent snapshot of the running database
(`sqlite3 .backup`, safe even while the container is running),
compresses it, and uploads it to pCloud. Local snapshots older than 30
days are cleaned up automatically (configurable via `RETENTION_DAYS`).

**Automatically via cron** (daily at 3am, example):
```bash
crontab -e
# add this line:
0 3 * * * cd /path/to/business-administration && ./backup/backup.sh >> backup/backup.log 2>&1
```

**Restore:**
```bash
docker compose down
./backup/restore.sh backup/archive/app-20260828-030000.db.gz
docker compose up -d
```
(Download the file back from pCloud first if it's no longer in
`backup/archive/` locally — e.g. `rclone copy
pcloud:GewerbeVerwaltung-Backups/app-....db.gz backup/archive/`.)

All details and configuration options are documented as comments in
`backup/backup.sh`.

## Tailscale / networking

By default the container listens on port 8000 on all interfaces —
reachable via the home server's local network IP. No VPN/Tailscale
setup is needed if you only use this on your home network. For access
from outside, you'd need to build your own path out (port forwarding,
a VPN of your choice, reverse proxy) — the tool itself has no
authentication built in, so don't expose it directly to the open
internet.

## Local development without Docker

See `AGENTS.md` → "Running locally without Docker" section.

## Developing with Claude Code / opencode

This repo includes an `AGENTS.md` with a project overview, conventions
(e.g. monetary amounts always as `Decimal`, never `float`), and the
workflow for schema changes via Alembic migrations. Both tools read it
automatically on startup in this directory.

## Documentation

- `AGENTS.md` — architecture, conventions, branching/release model,
  tooling, and the multi-agent implementation workflow.
- `docs/i18n.md` — how the German/English UI translation is set up,
  and how to add or change translated strings.

## Tech stack at a glance

| Part | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| i18n | i18next / react-i18next (DE/EN) |
| Backend | FastAPI, SQLAlchemy 2.x |
| Database | SQLite (file at `/data/app.db`) |
| Migrations | Alembic |
| Deployment | one Docker image, multi-stage build, published to GHCR |
| CI/CD | GitHub Actions — `ci.yaml` (lint/format/tests), `cd.yaml` (release) |
| Backup | rclone → pCloud |
