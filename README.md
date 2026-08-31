# Gewerbe-Verwaltung

Selbst gehostetes Tool für Rechnungen, Ausgaben und eine EÜR-Vorschau
für ein Kleingewerbe (Kleinunternehmerregelung §19 UStG). React +
FastAPI + SQLite, alles in einem Docker-Container.

Ersetzt keine Steuerberatung.

## Schnellstart (Docker)

**Option A — aus dem Quellcode bauen:**
```bash
git clone <dieses-repo> gewerbe-verwaltung
cd gewerbe-verwaltung
docker compose up -d --build
```

**Option B — vorgefertigtes Image von GHCR:**

Jede Version ab `v0.1.0` wird beim Release automatisch nach
`ghcr.io/feardrop/business-administration` gepusht (Tags `vX.Y.Z` und
`latest`) — siehe `.github/workflows/cd.yaml`. Solange das Repo privat
ist, ist auch das Image privat; einmalig einloggen mit einem
[Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
mit `read:packages`-Scope:
```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <dein-github-user> --password-stdin
docker pull ghcr.io/feardrop/business-administration:latest
```
Dann `docker-compose.yml`s `build: .` durch `image:
ghcr.io/feardrop/business-administration:latest` ersetzen (oder eine
eigene Compose-Datei ohne Build-Schritt verwenden) und `docker compose
up -d` starten — ohne lokalen Checkout und ohne Build.

Danach im Browser: `http://<heimserver-ip>:8000`

Die Datenbank liegt als einzelne Datei unter `./data/app.db` auf dem
Host (per Bind-Mount) — persistiert also Container-Neustarts und
-Updates. Beim ersten Start werden die Tabellen automatisch angelegt
(kein manueller Migrationsschritt nötig).

Trag als Erstes unter **Einstellungen** deine Geschäftsdaten ein
(Name, Anschrift, Steuernummer) — die erscheinen auf jeder Rechnung.

Die Oberfläche ist auf Deutsch und Englisch verfügbar (Umschalter unten
in der Seitenleiste). Die gedruckte Rechnung selbst bleibt unabhängig
davon immer auf Deutsch, da sie ein rechtsgültiges Dokument nach
deutschem Steuerrecht ist.

## Updates einspielen

```bash
git pull
docker compose up -d --build
```

Neue Datenbank-Migrationen (falls vorhanden) laufen beim Container-Start
automatisch (`backend/entrypoint.sh` führt `alembic upgrade head` aus,
bevor der Server startet).

## Backups nach pCloud

Backups nutzen [`rclone`](https://rclone.org) mit pCloud als Remote.

**Einmalige Einrichtung** (auf dem Host, nicht im Container):
```bash
# rclone installieren, z. B.:
curl https://rclone.org/install.sh | sudo bash

# pCloud-Remote einrichten (folgt dem Browser-OAuth-Flow):
rclone config
# -> "n" (neues Remote) -> Name: pcloud -> Typ: pcloud -> restlichen Fragen mit Enter durch
```

**Backup erstellen:**
```bash
./backup/backup.sh
```
Das Script macht einen konsistenten Snapshot der laufenden Datenbank
(`sqlite3 .backup`, sicher auch bei laufendem Container), komprimiert
ihn und lädt ihn nach pCloud hoch. Lokale Snapshots älter als 30 Tage
werden automatisch aufgeräumt (einstellbar über `RETENTION_DAYS`).

**Automatisch per Cron** (täglich um 3 Uhr, Beispiel):
```bash
crontab -e
# Zeile hinzufügen:
0 3 * * * cd /pfad/zu/gewerbe-verwaltung && ./backup/backup.sh >> backup/backup.log 2>&1
```

**Wiederherstellen:**
```bash
docker compose down
./backup/restore.sh backup/archive/app-20260828-030000.db.gz
docker compose up -d
```
(Datei aus pCloud vorher wieder lokal herunterladen, falls sie nicht
mehr lokal in `backup/archive/` liegt — z. B. `rclone copy
pcloud:GewerbeVerwaltung-Backups/app-....db.gz backup/archive/`.)

Alle Details und Konfigurationsoptionen stehen als Kommentare in
`backup/backup.sh`.

## Tailscale / Netzwerk

Standardmäßig lauscht der Container auf Port 8000 auf allen
Interfaces — erreichbar über die lokale Netzwerk-IP des Heimservers.
Kein VPN/Tailscale-Setup nötig, wenn du das nur im Heimnetz nutzt. Für
Zugriff von unterwegs müsstest du selbst einen Weg nach draußen bauen
(Port-Forwarding, VPN deiner Wahl, Reverse Proxy) — das Tool selbst hat
keine Authentifizierung eingebaut, also nicht ungeschützt ins offene
Internet stellen.

## Lokale Entwicklung ohne Docker

Siehe `AGENTS.md` → Abschnitt "Running locally without Docker".

## Mit Claude Code / opencode weiterentwickeln

Dieses Repo enthält eine `AGENTS.md` mit Projektüberblick, Konventionen
(z. B. Geldbeträge immer als `Decimal`, nie `float`) und dem Workflow
für Schema-Änderungen über Alembic-Migrationen. Beide Tools lesen sie
automatisch beim Start in diesem Verzeichnis.

## Tech-Stack im Überblick

| Teil | Technologie |
|---|---|
| Frontend | React 18, Vite |
| i18n | i18next / react-i18next (DE/EN) |
| Backend | FastAPI, SQLAlchemy 2.x |
| Datenbank | SQLite (Datei unter `/data/app.db`) |
| Migrationen | Alembic |
| Deployment | ein Docker-Image, Multi-Stage-Build, auf GHCR veröffentlicht |
| CI/CD | GitHub Actions — `ci.yaml` (Lint/Format/Tests), `cd.yaml` (Release) |
| Backup | rclone → pCloud |
