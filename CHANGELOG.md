# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) — see
AGENTS.md's "Branching and releasing" section for how the version number
here relates to the `release/vX.Y.Z` branch workflow.

## [Unreleased]

### Added

- §14 UStG mandatory invoice fields (issue #33):
  - `Invoice.service_date`/`service_period_text` — the invoice can now
    state when the service was actually rendered (an exact Leistungsdatum,
    or a free-text Leistungszeitraum like "August 2026" for work invoiced
    later than it was performed), separate from the document date. The UI
    lets the user pick one mode or the other; the printed document shows
    whichever is set.
  - `vat_rate` moved from `Invoice` to `InvoiceItem` — mixing 19%/7% lines
    on one invoice (e.g. a shooting fee plus an image licence) no longer
    requires splitting into two invoices. `invoiceTotals()` now groups net/
    VAT subtotals per distinct rate present (a new `breakdown` array), and
    the printed invoice shows a per-rate breakdown table instead of a
    single combined VAT line — Kleinunternehmer invoices still show no VAT
    breakdown at all.
  - `Settings.ust_id_nr` (Umsatzsteuer-Identifikationsnummer), separate
    from `tax_number` (Steuernummer) and optional — printed on the invoice
    only when set.
  - Issuing a draft (`POST /api/invoices/{id}/issue`) now validates the
    full §14 Abs. 4 UStG mandatory-field checklist (supplier name/address,
    Steuernummer-or-USt-IdNr, recipient name, service date/period, at
    least one line item) and fails with a structured 422
    (`{"message": ..., "missing_fields": [...]}`) naming exactly what's
    missing, rather than assigning a number regardless. Under a 250€ gross
    total, the §33 UStDV Kleinbetragsrechnung exemption relaxes the
    recipient-address requirement.
  - The dashboard's missing-required-settings banner now also flags a
    missing Steuernummer-or-USt-IdNr and address, consistent with the new
    issue-time validation.
  - Migration backfills every existing `InvoiceItem` with its parent
    invoice's old `vat_rate` before dropping the now-redundant
    `Invoice.vat_rate` column.
- Draft invoice status (issue #25): new invoices now start as editable,
  numberless drafts instead of immediately burning an invoice number.
  Nothing is assigned — no `number`, no `is_kleinunternehmer`/`vat_rate`
  settings snapshot — until the draft is explicitly issued
  (`POST /api/invoices/{id}/issue`), which is the one-way transition that
  assigns the number, snapshots settings, stamps `issued_at`, and locks
  the record. Drafts can be freely edited (`PATCH /api/invoices/{id}`) or
  deleted; issued invoices are immutable via either route (409). An
  abandoned/deleted draft never consumes a number slot, so the sequence
  stays gap-free (GoBD). The frontend gained a "Save draft"/"Issue" pair
  of actions on the invoice form, a draft badge on the invoice list, and
  edit/issue/delete actions on the invoice detail page gated on draft
  status. The status column's target lifecycle now also documents
  "teilweise bezahlt" and "storniert" as future states for the
  cancellation (#26) and partial-payment (#30) issues stacked on top of
  this one, though neither is implemented yet.
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
