# AGENTS.md

Guidance for AI coding agents (Claude Code, opencode, etc.) working in
this repository. Read this before making changes.

## What this is

A self-hosted invoicing + expense tracker for a small photography
business (Kleingewerbe, Kleinunternehmerregelung §19 UStG, German tax
context). Single user, low volume — built for simplicity over scale.

## Stack

- **Backend**: FastAPI + SQLAlchemy 2.x + Alembic, Python 3.12
- **Frontend**: React 18 + TypeScript + Vite (no router library —
  tab-based navigation via a `tab` state string in `App.tsx`, see below)
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
  tests/                   pytest suite — see "Testing" below
  requirements-dev.txt       pytest/ruff/ty/pre-commit, kept out of the runtime image
  entrypoint.sh          runs `alembic upgrade head` then starts uvicorn
frontend/
  src/
    App.tsx               top-level state + tab switch, talks to api.ts
    api.ts                 fetch wrapper for /api/*
    types.ts                shared TS types mirroring backend/app/schemas.py
    utils.ts                 formatting + invoice-total calculations
    i18n/                     i18next setup (index.ts) + locales/{de,en}.json
    pages/                    Dashboard, InvoiceList, InvoiceForm, InvoiceDetail, Expenses, SettingsPage
    components/               Sidebar (incl. language switch), Icons
    styles.css                 all styling — plain CSS with custom properties, no framework
    *.test.ts(x) / *.slow.test.tsx   Vitest — see "Testing" below
  tsconfig.json, tsconfig.app.json, tsconfig.node.json   TS project references (strict mode)
  eslint.config.js, .prettierrc.json   frontend lint/format config
backup/
  backup.sh, restore.sh   sqlite snapshot + rclone-to-pCloud upload/restore
.github/
  workflows/ci.yaml            lint/format/fast-tests + slow-tests + branch-policy + docker-build
  workflows/cd.yaml            tag + GitHub Release + GHCR image + post-release branch/PR, on merge to main
  scripts/extract_changelog_section.py   pulls one version's notes out of CHANGELOG.md for cd.yaml
pyproject.toml             ruff/pytest config (tool config only — not a packaged project)
.pre-commit-config.yaml      the lint/format/test suite CI and local commits both run
VERSION                       plain `X.Y.Z`, bumped on a release/* branch — see "Branching and releasing"
CHANGELOG.md                Keep a Changelog — add entries under [Unreleased] in the same PR as the change
Dockerfile                multi-stage: node builds frontend, python:3.12-slim runs the app
docker-compose.yml          single service, mounts ./data for the sqlite file
```

## Running locally without Docker

Backend:
```
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
export DATABASE_URL=sqlite:///./local.db
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Frontend (separate terminal — Vite dev server proxies `/api` to
`localhost:8000`, see `frontend/vite.config.ts`):
```
cd frontend
npm install
npm run dev
```

## Branching and releasing

Three-tier flow: `development` (integration, and the repo's default
branch) → `release/vX.Y.Z` (cut from `development`; carries only the
version bump and changelog cutover) → `main` (released only).

- **Day-to-day work** branches off `development` and PRs back into it.
- **Cutting a release**: branch `release/vX.Y.Z` from `development`,
  bump the version in `VERSION` (a plain `X.Y.Z`, no `v` prefix — it's
  the single source of truth `.github/workflows/cd.yaml` reads), and
  turn `CHANGELOG.md`'s `## [Unreleased]` section into `## [X.Y.Z] -
  YYYY-MM-DD` (Keep a Changelog format) with a fresh empty `##
  [Unreleased]` above it. PR `release/vX.Y.Z` into `main`.
  `.github/workflows/ci.yaml`'s `branch-policy` job fails any PR into
  `main` whose source branch isn't `release/*`.
- **On merge to `main`**, `.github/workflows/cd.yaml` fires once CI is
  green on that push (via a `workflow_run` trigger — a release PR's own
  CI run, which happens on its `release/*` head branch, doesn't trigger
  it; only the merge itself does). It's a no-op unless `VERSION`'s value
  has no matching `vX.Y.Z` tag yet, in which case it: tags the commit,
  extracts that version's `CHANGELOG.md` section (via
  `.github/scripts/extract_changelog_section.py`) as GitHub Release
  notes, builds and pushes a Docker image to
  `ghcr.io/feardrop/business-administration` tagged both `vX.Y.Z` and
  `latest`, and opens a `post-release/vX.Y.Z` branch + PR back into
  `development` — see below.
- **Post-release sync**: that PR exists so `main`'s post-release state
  (the version bump, the changelog cutover, and anything else that
  landed directly on `main`) flows back into `development` through
  review, the same as any other change, rather than a silent direct
  merge. Merge it promptly so `development` doesn't drift from `main`.

Nothing about the version number or changelog content is generated
automatically — bumping `VERSION` and writing the changelog entry are
manual steps taken on the `release/vX.Y.Z` branch, same as the sibling
`databricks-web-app` repo's release model (see its README if you want
the fuller rationale).

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
  informal ("du"). The language switch (DE/EN buttons in `Sidebar.tsx`)
  persists to `localStorage` via `i18next-browser-languagedetector`,
  which also picks the browser language on first visit. See
  `docs/i18n.md` for the full guide (adding a string, adding a
  namespace, testing translations).
  - **Exception: the printable invoice document** (the `.invoice-doc`
    block in `InvoiceDetail.tsx`) is hardcoded German and does *not* go
    through `t()`. It's the actual legal invoice sent to clients under
    German tax law (§19 UStG) — its language must not follow the
    admin's UI language preference. Everything around it (buttons,
    confirm dialogs) is translated normally.
  - `EXPENSE_CATEGORIES` in `utils.ts` are canonical keys (`"equipment"`,
    `"software"`, …) stored as-is in the DB; translate the *label* via
    `t(\`expenses.categories.${key}\`)`, never the stored value.
  - `fmtEUR`/`fmtDate` in `utils.ts` take a `lang` ("de"/"en") param and
    format via `Intl`/`toLocaleDateString` — pass the current
    `i18n.language`, or `"de"` explicitly for the invoice document.
- No authentication layer exists — this assumes it's only reachable on
  the home network / VPN. If you add auth, it belongs in
  `backend/app/main.py` as middleware, not scattered per-router.

## Tooling and pre-commit

One-time setup after installing `backend/requirements-dev.txt`:
```
pre-commit install                        # fast checks on every commit
pre-commit install --hook-types pre-push  # + slow tests before push
```

`.pre-commit-config.yaml` is the single source of truth for lint/format/
test commands — `.github/workflows/ci.yaml` runs the exact same config
(`pre-commit run --all-files`), so a clean local run means CI will pass.
It covers, in order: standard hygiene hooks, `ruff check --fix` +
`ruff format` (backend lint/format — see `pyproject.toml`'s `[tool.ruff]`
for the FastAPI-`Depends()` bugbear allowlist), `ty check app` (backend
type-check, run as a `local`/`language: system` hook rather than via
`astral-sh/ty-pre-commit` — that hook resolves third-party imports
through `uv` reading `[project.dependencies]` from `pyproject.toml`, but
this repo deliberately has no `[project]` table, so `ty` instead runs
from whatever Python environment `requirements-dev.txt` is installed
into, same as `backend-fast-tests` below; two
`ty: ignore[invalid-assignment]` lines in `crud.py` are a known
false-positive from `models.py`'s legacy `Column()` declarative style,
not real bugs — see the comments there), `eslint` + `prettier --check`
(frontend, via the project's own `npm run lint`/`format:check` rather
than pre-commit's node-language support, so it reuses
`frontend/node_modules` instead of provisioning a second node env),
`tsc -b` (frontend type-check, `frontend-typecheck`, same
system-hook reasoning as `ty`), then the fast test suites. Slow tests
(`backend-slow-tests`/`frontend-slow-tests`) only run at the `pre-push`
stage and in CI's separate `slow-tests` job — see "Testing" below for
what "slow" means here. A `pre-commit-update` hook checks (dry-run only,
never auto-applies) whether any pinned hook is behind its latest
release; it's `stages: [manual]` so it never slows down a commit, and
CI's `pre-commit-update` job runs it explicitly.

## Testing

**Backend** — `pytest`, configured in the root `pyproject.toml`
(`testpaths = ["backend/tests"]`, `pythonpath = ["backend"]`, so `pytest`
works from the repo root with no extra setup). `backend/tests/conftest.py`
points `DATABASE_URL` at a temp-file SQLite DB *before* importing any
`app.*` module — `app/database.py` builds its engine at import time from
that env var, so the ordering matters; read the docstring there before
adding fixtures. Use `@pytest.mark.slow` for anything that shouldn't
run on every commit (the marker is registered in `pyproject.toml`):
```
pytest -m "not slow"   # fast — what pre-commit and CI's pre-commit job run
pytest -m slow         # slow — what pre-push and CI's slow-tests job run
pytest                 # everything
```

**Frontend** — Vitest. Fast tests live in `*.test.ts(x)`; slow ones in
`*.slow.test.tsx` (see `frontend/package.json`'s `test`/`test:slow`
scripts, which filter by that naming convention since Vitest has no
pytest-style marker system).
```
npm test        # fast
npm run test:slow
npm run typecheck  # tsc -b, no emit — same check as the frontend-typecheck hook
```

`backend/tests/test_smoke.py` and `frontend/src/utils.test.ts` /
`App.slow.test.tsx` were originally deliberately minimal placeholders for
the fast/slow split — issue #17 filled in the comprehensive coverage they
were standing in for: invoice-numbering sequencing/prefixes/year-scoping
(`test_invoice_numbering.py`), the `is_kleinunternehmer`/`vat_rate`
snapshot behavior (`test_invoice_snapshot.py`), Decimal handling end-to-end
including over the HTTP layer (`test_invoice_decimal_handling.py`),
`paid_date` set/clear on status changes (`test_invoice_status.py`),
route-level 404/422 cases (`test_routes_error_cases.py`), locale key
parity (`test_i18n_parity.py`), `invoiceTotals`/`fmtEUR`/`fmtDate` coverage
in `utils.test.ts`, and a per-page smoke render under
`frontend/src/pages/*.test.tsx`. Don't assume a behavior is untested just
because it predates this list — check for a test file before writing a new
one.

A trap worth knowing about if you're tempted to freeze `datetime.date.today()`
in a backend test (e.g. via `monkeypatch.setattr` on a subclass) to simulate
a year boundary: SQLAlchemy caches each compiled statement's bind
processors on the module-level `engine`, and the SQLite `Date` type's
processor closes over `datetime.date` *at that cache's first-compile time*
to build its `isinstance()` check. A fake `date` subclass swapped in for one
test can leave a stale processor cached against that specific subclass,
which then rejects a *different* fake subclass (or the real `datetime.date`)
in a later test with a confusing `TypeError: SQLite Date type only accepts
Python date objects as input.` — see the module docstring in
`test_invoice_numbering.py` for how that test suite works around it instead
(planting rows for another year directly via the ORM model rather than
faking "now").

Manually verify UI changes by running the app and hitting the flows in
the browser too — the test suite is not a substitute for that.

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
- Base it on `development` (the default branch — see "Branching and
  releasing" above) and PR back into `development`, unless the issue is
  explicitly a follow-on to another still-open issue's branch (the
  roadmap and dependency comments say when this applies — e.g. #26
  cancellation logically stacks on #25 drafts). In that case, branch
  from the prerequisite's branch, not from `development`, and say so in
  the PR ("Stacked on #<PR>"). Never branch an issue implementation from
  `main` or target `main` directly — `main` only receives merges from
  `release/*` branches.
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
#17 (establishing a *comprehensive* test suite) is deliberately the
first issue in the roadmap's Phase 0 precisely because most of what
follows touches money, invoice numbering, or tax-law correctness, and
that class of bug is exactly what a regression suite exists to catch.
The fast/slow pytest + Vitest harness, `pre-commit`, and `ci.yaml`
already exist (see "Tooling and pre-commit" and "Testing" above) — #17
is about filling that harness with real coverage, not building it from
scratch. New tests go in `backend/tests/` or alongside the frontend
source per the conventions there; CI enforces they keep passing.

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
