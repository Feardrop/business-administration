"""FastAPI entrypoint.

Serves the JSON API under /api/* and, if a built frontend exists at
static/ (copied there during the Docker build — see /Dockerfile), also
serves the React app itself. That's what lets this run as a single
container: one Python process, one port.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import expenses, invoices, settings

app = FastAPI(title="Gewerbe-Verwaltung")

app.include_router(settings.router)
app.include_router(invoices.router)
app.include_router(expenses.router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_catch_all(full_path: str):
        # Any path that isn't /api/... or /assets/... falls through to
        # index.html so React Router (client-side routing) can take over.
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
else:

    @app.get("/")
    def dev_root():
        return {"status": "backend running, no built frontend found — run the frontend dev server separately"}
