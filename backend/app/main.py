"""FastAPI entrypoint.

Serves the JSON API under /api/* and, if a built frontend exists at
static/ (copied there during the Docker build — see /Dockerfile), also
serves the React app itself. That's what lets this run as a single
container: one Python process, one port.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import expenses, invoices, settings

app = FastAPI(title="Gewerbe-Verwaltung")

app.include_router(settings.router)
app.include_router(invoices.router)
app.include_router(expenses.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if STATIC_DIR.exists():
    # Resolved once so every request can be checked against it below without
    # re-resolving on each call.
    static_root = STATIC_DIR.resolve()

    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_catch_all(full_path: str):
        # Guard: reject unmatched /api/* paths (real API routes are registered
        # before this catch-all, so only typos/missing endpoints reach here)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)

        # Guard: `full_path` is user-controlled and may contain `../` (or an
        # encoding of it that survives to here, e.g. `%2f`) — resolve the
        # joined path and require it stay inside STATIC_DIR before treating
        # it as a real file, rather than trusting upstream (Starlette/uvicorn)
        # to have normalized it away already. A path that escapes falls
        # through to the same index.html response as any other unknown route.
        candidate = (STATIC_DIR / full_path).resolve()
        if candidate.is_relative_to(static_root) and candidate.is_file():
            return FileResponse(candidate)

        # Any path that isn't /api/... or /assets/... (or that tried to
        # escape STATIC_DIR above) falls through to index.html so React
        # Router (client-side routing) can take over.
        return FileResponse(STATIC_DIR / "index.html")
else:

    @app.get("/")
    def dev_root():
        return {"status": "backend running, no built frontend found — run the frontend dev server separately"}
