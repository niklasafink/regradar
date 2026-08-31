#!/usr/bin/env python3
"""Leert NEWSLETTER_PENDING.md nach dem Versand des Rahmenwerk-Newsletters.

Wird vom stündlichen launchd-Lauf (run_hourly.sh) aufgerufen. Fragt beim
Web-Backend den Zeitpunkt des letzten echten Versands ab
(GET /api/newsletter/frameworks?status=1, Auth via CRON_SECRET) und leert
die Sammel-Datei im Repo-Root, sobald ein neuerer Versand stattfand als beim
letzten Leeren — alle Einträge, auch nicht in die Mail übernommene, damit
nichts in die Folgewoche übertragen wird.

Zustand: scraper/data/.fw_newsletter_cleared enthält den lastSentAt-Wert,
für den zuletzt geleert wurde.
"""

import json
import sys
import urllib.request
from pathlib import Path

SCRAPER_DIR = Path(__file__).resolve().parent
REPO = SCRAPER_DIR.parent
PENDING = REPO / "NEWSLETTER_PENDING.md"
MARKER = SCRAPER_DIR / "data" / ".fw_newsletter_cleared"
ENV_LOCAL = REPO / "web" / ".env.local"
# Bis hierhin (einschließlich) bleibt der Template-Kopf stehen.
HEADER_END = "<!-- Einträge unterhalb dieser Zeile"


def read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def main() -> int:
    env = read_env(ENV_LOCAL)
    # APP_URL in .env.local zeigt auf localhost (Dev) — der Versand läuft aber
    # in Produktion, also immer dort nachfragen.
    base = env.get("APP_URL") or ""
    if not base or "localhost" in base or "127.0.0.1" in base:
        # www ist kanonisch; regradar.de antwortet mit 308, dem urllib nicht folgt
        base = "https://www.regradar.de"
    secret = env.get("CRON_SECRET")
    if not secret:
        print("newsletter-pending: CRON_SECRET fehlt in web/.env.local")
        return 0  # kein harter Fehler im Stundenlauf

    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/newsletter/frameworks?status=1",
        headers={
            "Authorization": f"Bearer {secret}",
            "User-Agent": "regradar-scraper/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        last_sent = json.load(resp).get("lastSentAt")

    if not last_sent:
        return 0  # noch nie verschickt

    already = MARKER.read_text(encoding="utf-8").strip() if MARKER.exists() else ""
    if last_sent <= already:
        return 0  # für diesen Versand wurde schon geleert

    if PENDING.exists():
        lines = PENDING.read_text(encoding="utf-8").splitlines(keepends=True)
        keep: list[str] = []
        for line in lines:
            keep.append(line)
            if HEADER_END in line:
                break
        removed = len(lines) - len(keep)
        PENDING.write_text("".join(keep), encoding="utf-8")
        print(f"newsletter-pending: geleert nach Versand {last_sent} ({removed} Zeilen entfernt)")
    else:
        print("newsletter-pending: Datei fehlt, nur Marker aktualisiert")

    MARKER.parent.mkdir(parents=True, exist_ok=True)
    MARKER.write_text(last_sent + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # Stundenlauf nie an diesem Schritt scheitern lassen
        print(f"newsletter-pending: Fehler: {e}")
        sys.exit(0)
