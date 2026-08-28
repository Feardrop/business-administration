#!/bin/sh
# Restores a backup snapshot over the live database.
# ALWAYS stop the app first, or writes during restore can corrupt things.
#
# Usage:
#   docker compose down
#   ./backup/restore.sh backup/archive/app-20260828-030000.db.gz
#   docker compose up -d
set -eu

SNAPSHOT="${1:?Usage: restore.sh <path-to-snapshot.db.gz>}"
DB_PATH="${DB_PATH:-./data/app.db}"

if [ ! -f "$SNAPSHOT" ]; then
  echo "Fehler: $SNAPSHOT nicht gefunden." >&2
  exit 1
fi

echo "Sichere aktuelle Datenbank nach ${DB_PATH}.before-restore ..."
[ -f "$DB_PATH" ] && cp "$DB_PATH" "${DB_PATH}.before-restore"

echo "Stelle $SNAPSHOT wieder her nach $DB_PATH ..."
gunzip -c "$SNAPSHOT" > "$DB_PATH"

echo "Fertig. Container wieder starten mit: docker compose up -d"
