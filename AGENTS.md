# AGENTS.md

Guidance for AI coding agents (Claude Code, opencode, etc.) working in
this repository. Read this before making changes.

## What this is

A self-hosted invoicing + expense tracker for a small photography
business (Kleingewerbe, Kleinunternehmerregelung §19 UStG, German tax
context). Single user, low volume — built for simplicity over scale.

## Stack

- **Backend**: FastAPI + SQLAlchemy 2.x + Alembic, Python 3.12
- **Frontend**: React 18 + Vite (no router library — tab-based
  navigation via a `tab` state string in `App.jsx`, see below)
- **Database**: SQLite, file at `/data/app.db` in the container
  (`DATABASE_URL` env var controls this — see `backend/app/database.py`)
- **Deployment**: one Docker container. The image builds the React app
  and copies the static output into the FastAPI container; FastAPI
  serves both the JSON API (`/api/*`) and the built frontend (everything
  else) from a single process. See `Dockerfile` and `backend/app/main.py`.

## Repo layout

```
backend/
  app/
    main.py          FastAPI app, mounts API routers + serves static frontend
    database.py       engine/session, reads DATABASE_URL
    models.py          SQLAlchemy models (Settings, Invoice, InvoiceItem, Expense)
    schemas.py         Pydantic request/response models
    crud.py             DB access functions used by the routers
    routers/            one file per resource (settings, invoices, expenses)
  alembic/               migrations — see "Changing the schema" below
  entrypoint.sh          runs `alembic upgrade head` then starts uvicorn
frontend/
  src/
    App.jsx               top-level state + tab switch, talks to api.js
    api.js                 fetch wrapper for /api/*
    utils.js                 formatting + invoice-total calculations
    pages/                    Dashboard, InvoiceList, InvoiceForm, InvoiceDetail, Expenses, SettingsPage
    components/               Sidebar, Icons
    styles.css                 all styling — plain CSS with custom properties, no framework
backup/
  backup.sh, restore.sh   sqlite snapshot + rclone-to-pCloud upload/restore
Dockerfile                multi-stage: node builds frontend, python:3.12-slim runs the app
docker-compose.yml          single service, mounts ./data for the sqlite file
```

## Running locally without Docker

Backend:
```
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=sqlite:///./local.db
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Frontend (separate terminal — Vite dev server proxies `/api` to
`localhost:8000`, see `frontend/vite.config.js`):
```
cd frontend
npm install
npm run dev
```

## Changing the database schema

Never hand-edit the SQLite file and never edit an already-applied
migration in `alembic/versions/`. Instead:

1. Edit `backend/app/models.py`.
2. From `backend/`, with `DATABASE_URL` pointing at a dev database:
   ```
   alembic revision --autogenerate -m "short description"
   ```
3. **Read the generated file in `alembic/versions/`** — autogenerate is
   good but not perfect (it won't detect some column-type changes,
   check constraints, etc.). Adjust by hand if needed.
4. Apply it: `alembic upgrade head`.
5. Commit the new migration file alongside the model change, same PR.

The Docker entrypoint (`backend/entrypoint.sh`) runs `alembic upgrade
head` automatically on every container start, so a rebuild + restart is
enough to pick up new migrations in production — no manual DB step.

## Conventions

- **Money is `Numeric(10,2)` / Python `Decimal`, never `float`**, in
  both `models.py` and `schemas.py`, to avoid binary floating-point
  rounding errors accumulating across invoice line items. Keep this
  when adding new monetary fields.
- **Invoice numbering** happens server-side in `crud._next_invoice_number`
  (year + running count + optional prefix from settings). Don't let the
  frontend generate or submit invoice numbers.
- **`is_kleinunternehmer` and `vat_rate` are snapshotted onto the
  `Invoice` row at creation time** from the current settings — this is
  intentional. If the user later flips the Kleinunternehmer setting,
  past invoices must keep showing what was actually true when they were
  issued. Don't "fix" this into a live join against `settings`.
- **Design tokens** (colors, fonts) live as CSS custom properties at the
  top of `frontend/src/styles.css` (`--paper`, `--ink`, `--accent`,
  etc.). Reuse them; don't hardcode hex values in components.
- German-language UI strings throughout (this is a German Kleingewerbe
  tool) — keep new UI text in German, consistent with the existing tone
  (direct, slightly informal "du").
- No authentication layer exists — this assumes it's only reachable on
  the home network / VPN. If you add auth, it belongs in
  `backend/app/main.py` as middleware, not scattered per-router.

## Testing

No automated tests exist yet. If you add backend tests, use `pytest`
with a throwaway SQLite DB (see how `backend/app/database.py` reads
`DATABASE_URL` — point it at `sqlite:///:memory:` or a temp file in
fixtures). Manually verify by running the app and hitting the flows in
the browser before considering a change done — there's no CI here to
catch regressions.

## What not to do

- Don't add a second database engine "for real production use" —
  SQLite is a deliberate choice for a single-user tool, not a
  placeholder.
- Don't split this into multiple containers/services — the single-image
  approach is deliberate (see `Dockerfile`); if you're tempted to add a
  reverse proxy, cache, or separate DB container, check with the user
  first.
- Don't commit `backend/static/` (build output), `frontend/dist/`,
  `frontend/node_modules/`, `*.db*` files, or `backup/rclone.conf` —
  all covered by `.gitignore`, but be careful with `git add -A`.
