"""Tests for path-traversal hardening in `spa_catch_all` (main.py).

`STATIC_DIR` (backend/app/../static) only exists in a real Docker build,
where the frontend's `dist/` output is copied there (see /Dockerfile) — it
is never present for a plain `pytest` run in this repo (confirmed: neither
local dev setup nor `.github/workflows/ci.yaml`'s `slow-tests` job builds
the frontend before running pytest). `app/main.py` only defines and
registers `spa_catch_all` inside `if STATIC_DIR.exists():`, evaluated once
at import time, so without a real `static/` directory on disk the route
under test doesn't even exist.

To exercise the *actual* route through a real ASGI request (rather than
duplicating its logic in a test-local copy that could silently drift from
the real implementation), the `spa_app` fixture below materializes a
minimal `backend/static/` tree plus sentinel files outside it, forces
`app.main` to reload so its module-level registration re-runs against a
directory that now exists, yields a `TestClient` bound to the freshly
reloaded app, and tears everything back down afterward (removing the
directories and reloading `app.main` again) so other test modules keep
seeing the no-static state `conftest.py`'s shared `app`/`client` fixtures
were built against.

Key finding from building these tests (see `test_dotdot_traversal_blocked`
and `test_data_db_traversal_blocked` docstrings for the specifics): a
plain, unencoded `../` in the request path sent through `TestClient` never
reaches `spa_catch_all` with the `..` intact — `httpx`'s own URL handling
collapses it client-side per RFC 3986 dot-segment removal before the
request is even issued (verified by inspecting `scope["path"]` via ASGI
middleware). A **percent-encoded** slash (`%2f`) survives that client-side
step untouched and *does* reach `spa_catch_all` with a literal `..` in
`full_path` — i.e. the vulnerability described in issue #12 is genuinely
reachable pre-fix, just not via the plain-`..` payload naively. Real HTTP
clients that don't perform httpx's client-side normalization (e.g. a raw
socket, `curl --path-as-is`) may deliver a literal, unencoded `../` to
uvicorn too — that path isn't independently verified here, so the fix does
not rely on any client normalizing anything.
"""

import importlib
import shutil
from pathlib import Path

import app.main as main_module
import pytest


@pytest.fixture()
def spa_app(db_session):
    """A TestClient for `app.main.app`, reloaded against a real static/ tree.

    Sentinel files, placed so specific traversal payloads used below would
    genuinely reach them if the guard were absent:
      backend/static/index.html          - SPA shell (safe fallback)
      backend/static/assets/app.js       - a legitimate asset
      backend/secret_outside_static.txt  - one level above static/
      backend/data/app.db                - one level above static/, the
                                            specific high-value target
                                            called out in issue #12
      <worktree_root>/etc/passwd         - two levels above static/,
                                            matching the exact depth of the
                                            issue's own example payload
                                            (`..%2f..%2fetc%2fpasswd`)
    """
    static_dir = Path(main_module.__file__).resolve().parent.parent / "static"
    backend_dir = static_dir.parent
    worktree_root = backend_dir.parent
    data_dir = backend_dir / "data"
    etc_dir = worktree_root / "etc"

    if static_dir.exists() or data_dir.exists() or etc_dir.exists():
        pytest.fail(
            "backend/static, backend/data or ./etc already exists on disk; "
            "refusing to overwrite — clean it up before running this test."
        )

    (static_dir / "assets").mkdir(parents=True)
    (static_dir / "index.html").write_text("<html>spa shell</html>")
    (static_dir / "assets" / "app.js").write_text("console.log('legit asset');")

    secret_file = backend_dir / "secret_outside_static.txt"
    secret_file.write_text("top secret, must never be served")

    data_dir.mkdir()
    (data_dir / "app.db").write_bytes(b"sqlite-format-3-fake-contents")

    etc_dir.mkdir()
    (etc_dir / "passwd").write_text("root:x:0:0:root:/root:/bin/bash")

    try:
        importlib.reload(main_module)

        from app.database import get_db
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        main_module.app.dependency_overrides[get_db] = override_get_db
        with TestClient(main_module.app) as test_client:
            yield test_client
    finally:
        shutil.rmtree(static_dir, ignore_errors=True)
        shutil.rmtree(data_dir, ignore_errors=True)
        shutil.rmtree(etc_dir, ignore_errors=True)
        secret_file.unlink(missing_ok=True)
        # Restore app.main to the no-static state other test modules expect.
        importlib.reload(main_module)


def _assert_safe_fallback(response):
    """Either genuinely blocked, or the request never carried the payload the app could act on."""
    assert "top secret" not in response.text
    assert b"sqlite-format-3-fake-contents" not in response.content
    assert "root:x:0:0" not in response.text
    assert response.status_code != 200 or "spa shell" in response.text


@pytest.mark.slow
def test_dotdot_traversal_blocked(spa_app):
    """An unnormalized `../` segment must never escape STATIC_DIR.

    Documented finding: `httpx` (the TestClient's transport) normalizes a
    leading `/../` out of the URL client-side per RFC 3986 before the
    request is even sent — `response.request.url` below has no `..` left
    in it, and `full_path` inside `spa_catch_all` never sees one for this
    exact payload. That is *not* the same as the traversal being
    unreachable in general (see the percent-encoded test below, which
    proves it is reachable), so the fix still doesn't assume this
    normalization happens.
    """
    response = spa_app.get("/../secret_outside_static.txt")
    assert str(response.request.url) == "http://testserver/secret_outside_static.txt"
    _assert_safe_fallback(response)


@pytest.mark.slow
def test_percent_encoded_traversal_blocked(spa_app):
    """A percent-encoded `../../etc/passwd`-style payload must be blocked.

    Unlike the plain `../` case, `%2f` is not touched by httpx's dot-segment
    normalization, so it survives to the ASGI layer, gets decoded back into
    a literal `/`, and `spa_catch_all` receives `full_path ==
    "../../etc/passwd"` — confirmed via ASGI-scope inspection while
    developing this test. Before the fix, this genuinely served
    `<worktree_root>/etc/passwd`'s contents; this is the proof the
    vulnerability was reachable, not just theoretical.
    """
    response = spa_app.get("/..%2f..%2fetc%2fpasswd")
    _assert_safe_fallback(response)

    # Same technique, one level up, aimed at this repo's own secret sentinel
    # rather than a path that happens to not exist — belt and suspenders.
    response = spa_app.get("/..%2fsecret_outside_static.txt")
    _assert_safe_fallback(response)


@pytest.mark.slow
def test_normalization_bypass_blocked(spa_app):
    """A `....//` style payload must not be misread as `../` and must not error.

    `"...."` contains no actual parent-directory token, so this payload was
    never a live escape even pre-fix (`STATIC_DIR / "....//....//etc/passwd"`
    stays nested *inside* `static/`, just under literally-named `"...."`
    directories, and no such file exists there). This test exists as a
    regression/documentation check that such inputs still fall through to
    the safe index.html response rather than raising.
    """
    response = spa_app.get("/....//....//etc/passwd")
    _assert_safe_fallback(response)


@pytest.mark.slow
def test_data_db_traversal_blocked(spa_app):
    """`../data/app.db` — the highest-value asset in the container — must be blocked.

    As in `test_dotdot_traversal_blocked`, the plain `../` form is
    normalized away by httpx before it reaches the app (`full_path` comes
    through as `"data/app.db"`, which isn't under `static/` either, so it
    safely falls through) — so this test also exercises the
    percent-encoded equivalent, which does carry a literal `..` into
    `spa_catch_all`, to prove the guard actually blocks reaching
    `backend/data/app.db` rather than the target merely not existing.
    """
    response = spa_app.get("/../data/app.db")
    assert str(response.request.url) == "http://testserver/data/app.db"
    _assert_safe_fallback(response)

    response = spa_app.get("/..%2fdata%2fapp.db")
    _assert_safe_fallback(response)


@pytest.mark.slow
def test_legitimate_asset_still_served(spa_app):
    """No regression: a normal `/assets/*` request is still served correctly."""
    response = spa_app.get("/assets/app.js")
    assert response.status_code == 200
    assert "legit asset" in response.text
