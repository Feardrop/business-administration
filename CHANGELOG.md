# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) — see
AGENTS.md's "Branching and releasing" section for how the version number
here relates to the `release/vX.Y.Z` branch workflow.

## [Unreleased]

### Added

- German/English i18n throughout the UI (i18next/react-i18next), with the
  printable invoice document intentionally staying German regardless of
  the selected language, since it's the legal document under German tax
  law.
- Project tooling: ruff + ty (backend), eslint + prettier + tsc (frontend),
  pytest + Vitest with a fast/slow test split, and pre-commit wiring all
  of it together, plus a `pre-commit-update` check for stale hook pins.
- `development` → `release/vX.Y.Z` → `main` branching workflow, with CI
  (`ci.yaml`) and a release/post-release pipeline (`cd.yaml`).
- `docs/i18n.md`: a dedicated guide to the German/English i18n setup
  (adding/changing strings, the invoice-document exception, locale-aware
  formatting, testing translations).

### Changed

- Migrated the entire frontend from JavaScript/JSX to TypeScript/TSX
  (strict mode), including a new `frontend/src/types.ts` mirroring the
  backend's Pydantic schemas and a `typecheck` npm script (`tsc -b`) run
  both standalone and as a pre-commit hook.
- Replaced `mypy` with [`ty`](https://github.com/astral-sh/ty) (Astral's
  Rust-based type checker) for backend type-checking, run as a local
  pre-commit hook against the dev environment rather than
  `astral-sh/ty-pre-commit`, since this repo deliberately has no
  `[project]` table for that hook's `uv`-based dependency resolution to
  read.
- Translated `README.md` from German to English.

### Fixed

- `models.py`: replaced the deprecated `datetime.utcnow()` call with a
  timezone-aware equivalent that preserves the same naive-UTC stored
  value.
- CI's `slow-tests` job: bumped `NODE_VERSION` to `"22"` — Node 20's
  bundled APIs are missing a method jsdom's `undici` dependency needs
  (`webidl.util.markAsUncloneable is not a function`). The Dockerfile's
  separate `node:20-alpine` frontend-build stage is unaffected since it
  never imports jsdom.
- `ci.yaml`: widened the `pull_request.branches` trigger filter to also
  match `issue-*` — a stacked PR (see AGENTS.md's multi-agent workflow)
  targets another open issue branch as its base rather than
  `development`/`release/*`/`main` directly, and previously got zero CI
  checks as a result.

### Security

- Hardened `spa_catch_all`'s static-file serving against path traversal:
  a user-controlled URL segment (e.g. `..%2f..%2fetc%2fpasswd`, a
  percent-encoded `../`) could previously resolve outside `STATIC_DIR` and
  serve arbitrary files readable by the process, including the SQLite
  database that holds the entire tax history (`/data/app.db` in the
  container). The joined candidate path is now resolved and required to
  stay under a once-resolved `STATIC_DIR` before being served; anything
  that doesn't falls through to the existing `index.html` SPA response.

## [0.1.0] - 2026-08-28

### Added

- Initial release: invoicing and expense tracking for a German
  Kleingewerbe photography business (Kleinunternehmerregelung, §19 UStG).
  React + Vite frontend, FastAPI + SQLAlchemy + Alembic backend, SQLite
  storage, single-container Docker deployment.
