#!/bin/sh
# Snapshots the SQLite database and uploads it to pCloud via rclone.
#
# Usage:
#   ./backup/backup.sh
#
# Config via env vars (all optional, defaults assume you run this from
# the repo root against the docker-compose ./data volume):
#   DB_PATH         path to the live database file   (default: ./data/app.db)
#   BACKUP_DIR      local staging dir for snapshots   (default: ./backup/archive)
#   RCLONE_REMOTE   rclone remote:path for uploads    (default: pcloud:GewerbeVerwaltung-Backups)
#   RETENTION_DAYS  delete local snapshots older than (default: 30)
#
# One-time setup:
#   1. Install rclone: https://rclone.org/install/
#   2. rclone config   -> "n" (new remote) -> name it "pcloud" -> type "pcloud"
#      -> follow the browser OAuth flow. This writes ~/.config/rclone/rclone.conf
#      (or set RCLONE_CONFIG to point elsewhere) — never commit that file.
#   3. sqlite3 must be installed on the host (or run this via
#      `docker compose exec app sh -c '...'`, since the container already
#      has sqlite3 — see README.md).
#   4. Schedule it, e.g. with host crontab:
#        0 3 * * *  cd /path/to/gewerbe-verwaltung && ./backup/backup.sh >> backup/backup.log 2>&1
set -eu

DB_PATH="${DB_PATH:-./data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-./backup/archive}"
RCLONE_REMOTE="${RCLONE_REMOTE:-pcloud:GewerbeVerwaltung-Backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if [ ! -f "$DB_PATH" ]; then
  echo "Fehler: Datenbank nicht gefunden unter $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
snapshot="$BACKUP_DIR/app-$timestamp.db"

echo "Erstelle konsistenten Snapshot: $snapshot"
sqlite3 "$DB_PATH" ".backup '$snapshot'"
gzip "$snapshot"
snapshot="$snapshot.gz"

if command -v rclone >/dev/null 2>&1; then
  echo "Lade nach $RCLONE_REMOTE hoch..."
  rclone copy "$snapshot" "$RCLONE_REMOTE"
else
  echo "Warnung: rclone nicht gefunden — Snapshot bleibt nur lokal in $BACKUP_DIR liegen." >&2
fi

echo "Räume lokale Snapshots älter als $RETENTION_DAYS Tage auf..."
find "$BACKUP_DIR" -name "app-*.db.gz" -mtime "+$RETENTION_DAYS" -delete

echo "Fertig: $snapshot"
