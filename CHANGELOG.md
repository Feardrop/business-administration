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

- Invoice numbering (`crud._next_invoice_number`): derive the next number
  from `MAX(sequence)` of a new explicit `Invoice.sequence` column,
  scoped by the invoice's real creation year, instead of `COUNT(*)` of
  invoices whose `number` contained the year as a substring. Fixes three
  bugs: deleting an invoice from the middle of a year's series could
  make the next create collide with a surviving number (unhandled 500);
  deleting the newest invoice silently reused its number (a GoBD
  Sec 14 Abs.4 Nr.4 UStG violation - numbers must stay unique and
  gapless); and a numeric `invoice_prefix` (e.g. "2026") could inflate
  the count via an unrelated substring match. `create_invoice` also now
  retries on a `UNIQUE` collision from near-simultaneous creates instead
  of surfacing a raw 500.
- `models.py`: replaced the deprecated `datetime.utcnow()` call with a
  timezone-aware equivalent that preserves the same naive-UTC stored
  value.
- CI's `slow-tests` job: bumped `NODE_VERSION` to `"22"` — Node 20's
  bundled APIs are missing a method jsdom's `undici` dependency needs
  (`webidl.util.markAsUncloneable is not a function`). The Dockerfile's
  separate `node:20-alpine` frontend-build stage is unaffected since it
  never imports jsdom.

## [0.1.0] - 2026-08-28

### Added

- Initial release: invoicing and expense tracking for a German
  Kleingewerbe photography business (Kleinunternehmerregelung, §19 UStG).
  React + Vite frontend, FastAPI + SQLAlchemy + Alembic backend, SQLite
  storage, single-container Docker deployment.
