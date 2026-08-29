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
    i18n/                     i18next setup (index.js) + locales/{de,en}.json
    pages/                    Dashboard, InvoiceList, InvoiceForm, InvoiceDetail, Expenses, SettingsPage
    components/               Sidebar (incl. language switch), Icons
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
- **i18n: German + English**, via `i18next`/`react-i18next`
  (`frontend/src/i18n/`). All UI chrome text (buttons, labels, page
  copy) goes through `t("namespace.key")` — add the string to both
  `frontend/src/i18n/locales/de.json` and `en.json`, never hardcode new
  UI text in a component. Keep the German tone direct and slightly
  informal ("du"). The language switch (DE/EN buttons in `Sidebar.jsx`)
  persists to `localStorage` via `i18next-browser-languagedetector`,
  which also picks the browser language on first visit.
  - **Exception: the printable invoice document** (the `.invoice-doc`
    block in `InvoiceDetail.jsx`) is hardcoded German and does *not* go
    through `t()`. It's the actual legal invoice sent to clients under
    German tax law (§19 UStG) — its language must not follow the
    admin's UI language preference. Everything around it (buttons,
    confirm dialogs) is translated normally.
  - `EXPENSE_CATEGORIES` in `utils.js` are canonical keys (`"equipment"`,
    `"software"`, …) stored as-is in the DB; translate the *label* via
    `t(\`expenses.categories.${key}\`)`, never the stored value.
  - `fmtEUR`/`fmtDate` in `utils.js` take a `lang` ("de"/"en") param and
    format via `Intl`/`toLocaleDateString` — pass the current
    `i18n.language`, or `"de"` explicitly for the invoice document.
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

## Multi-agent implementation workflow

The backlog for this project (issues #1–#73 on GitHub — nine epics, ~63
implementable sub-issues, indexed by the roadmap in #73) is designed to
be worked by multiple agent sessions in parallel, each taking one
sub-issue. This section is the convention every agent picking up an
issue should follow.

**Before starting an issue:**

1. Read the issue in full, including its **"Dependencies"** and
   **"Implementation Plan"** comment (added by the planning pass — if an
   issue has neither, treat it as not yet ready to implement and flag it
   rather than freelancing a plan).
2. Check every issue listed as "Blocked by" is actually closed/merged.
   Don't start an issue whose prerequisite schema, table, or endpoint
   doesn't exist yet — the plan comment names exactly what's assumed to
   already be there.
3. Check the issue's `agent:sonnet` / `agent:haiku` label. It's a
   complexity signal set during planning: `agent:haiku` means the task
   is mechanical and well-specified (a CRUD field, a CSS token pass, a
   config file); `agent:sonnet` means it touches money, tax/legal
   correctness, security, or an architectural decision and needs more
   judgment. Treat it as a strong default, not a hard rule — re-route to
   the more capable model if the issue turns out gnarlier than its label
   suggests.

**Branching and stacking:**

- Branch name: `issue-<N>-<short-slug>`, e.g. `issue-25-draft-invoices`.
- Base it on `main` unless the issue is explicitly a follow-on to
  another still-open issue's branch (the roadmap and dependency
  comments say when this applies — e.g. #26 cancellation logically
  stacks on #25 drafts). In that case, branch from the prerequisite's
  branch, not from `main`, and say so in the PR ("Stacked on #<PR>").
- Keep each PR scoped to one issue. If an issue is large enough that its
  own plan comment breaks it into phases, one PR per phase is fine —
  stack them in order, same convention.
- Never rebase or force-push a stacked branch that another agent's PR
  is based on without checking first; merge base branches in instead
  (see the root CLAUDE.md-equivalent git safety rules — same repo, same
  rules apply to every agent here).

**Test-driven development is not optional here:**

Every implementation PR commits the failing test *before* the commit
that makes it pass — two separate commits minimum, in that order, so
the history itself shows red-then-green. This isn't a style preference:
#17 (establishing the test suite) is deliberately the first issue in
the roadmap's Phase 0 precisely because most of what follows touches
money, invoice numbering, or tax-law correctness, and that class of bug
is exactly what a regression suite exists to catch. Until #17 lands,
new backend tests still go through `pytest` against a throwaway SQLite
DB (see `database.py`'s `DATABASE_URL` handling) and new frontend tests
through Vitest once added — don't skip writing them just because the
harness isn't wired into CI yet (#18).

**Model routing for implementation agents:**

When spawning a subagent to implement an issue, pass `model: "haiku"`
for `agent:haiku`-labeled issues and `model: "sonnet"` for
`agent:sonnet`-labeled ones. Give the subagent the issue number, its
full body, and its Dependencies + Implementation Plan comment — that
comment is written to be a self-contained brief, so the subagent
shouldn't need this repository's full history to start.

**Keeping the graph honest:**

If implementing an issue reveals a dependency that its "Dependencies"
comment missed (or one that comment listed but turns out not to be
real), add a comment on both affected issues noting the correction
before merging — the graph in #73 is a snapshot from planning time, not
a guarantee.

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
