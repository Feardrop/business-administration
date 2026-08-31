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
- Project tooling: ruff + mypy (backend), eslint + prettier (frontend),
  pytest + Vitest with a fast/slow test split, and pre-commit wiring all
  of it together, plus a `pre-commit-update` check for stale hook pins.
- `development` → `release/vX.Y.Z` → `main` branching workflow, with CI
  (`ci.yaml`) and a release/post-release pipeline (`cd.yaml`).

## [0.1.0] - 2026-08-28

### Added

- Initial release: invoicing and expense tracking for a German
  Kleingewerbe photography business (Kleinunternehmerregelung, §19 UStG).
  React + Vite frontend, FastAPI + SQLAlchemy + Alembic backend, SQLite
  storage, single-container Docker deployment.
