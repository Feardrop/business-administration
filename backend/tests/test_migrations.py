"""Tests that exercise an actual Alembic migration end to end, rather than
`Base.metadata.create_all` (which is what the `db_session`/`client`
fixtures in conftest.py use, and thus never runs migration code at all).

Runs `alembic` as a subprocess against its own throwaway sqlite file, with
`DATABASE_URL` overridden only in that subprocess's environment — this
deliberately does not touch `os.environ`/the already-imported `app.database`
engine in this process, which conftest.py has already pointed at a
different temp database before any `app.*` module was imported.
"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_alembic(db_path: Path, *args: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.slow
def test_migration_backfills_item_vat_rate(tmp_path):
    """Issue #33, TDD step 7: the migration that moves vat_rate from
    Invoice onto InvoiceItem must backfill every existing item with its
    parent invoice's rate, for a DB seeded the old way (invoice-level
    vat_rate, no invoice_items.vat_rate column at all yet).
    """
    db_path = tmp_path / "legacy.db"

    # Schema exactly as of the revision immediately before issue #33's.
    _run_alembic(db_path, "upgrade", "ea183f067399")

    con = sqlite3.connect(db_path)
    con.execute(
        "INSERT INTO invoices "
        "(id, number, date, client_name, client_address, is_kleinunternehmer, vat_rate, note, status) "
        "VALUES (1, '2025-001', '2025-06-01', 'Legacy Client', '', 0, 19, '', 'offen')"
    )
    con.execute(
        "INSERT INTO invoices "
        "(id, number, date, client_name, client_address, is_kleinunternehmer, vat_rate, note, status) "
        "VALUES (2, '2025-002', '2025-07-01', 'Other Client', '', 1, 0, '', 'offen')"
    )
    items_cols = "(id, invoice_id, description, qty, price)"
    con.execute(f"INSERT INTO invoice_items {items_cols} VALUES (1, 1, 'Shoot', 1, 100)")
    con.execute(f"INSERT INTO invoice_items {items_cols} VALUES (2, 1, 'Print', 2, 20)")
    con.execute(f"INSERT INTO invoice_items {items_cols} VALUES (3, 2, 'Shoot', 1, 50)")
    con.commit()
    con.close()

    _run_alembic(db_path, "upgrade", "head")

    con = sqlite3.connect(db_path)
    rows = dict(con.execute("SELECT id, vat_rate FROM invoice_items ORDER BY id").fetchall())
    columns = [row[1] for row in con.execute("PRAGMA table_info(invoices)").fetchall()]
    con.close()

    # Every item backfilled from its own parent invoice's old rate...
    assert rows == {1: 19, 2: 19, 3: 0}
    # ...and the now-redundant invoice-level column is gone.
    assert "vat_rate" not in columns
