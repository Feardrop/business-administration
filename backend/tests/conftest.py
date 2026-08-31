"""Shared pytest fixtures for the backend test suite.

`app/database.py` builds its engine from the `DATABASE_URL` env var at
*import* time, so that variable must be set before any `app.*` module is
imported for the first time — hence this happens at module load, ahead of
the `from app...` imports below (see AGENTS.md's "Testing" section).

A temp-file SQLite database is used rather than `sqlite:///:memory:`: with
the default connection pool, each new connection to `:memory:` gets its own
empty database, which silently breaks anything that opens more than one
connection (exactly what a `TestClient` request does per dependency call).
"""

import os
import tempfile

import pytest

_tmp_db_dir = tempfile.mkdtemp(prefix="business-administration-test-db-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db_dir}/test.db"

from app.database import Base, SessionLocal, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def db_session():
    """A DB session against a fresh schema, torn down after each test."""
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """A FastAPI TestClient wired to `db_session` via a dependency override."""
    from fastapi.testclient import TestClient

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
