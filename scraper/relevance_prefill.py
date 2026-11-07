#!/usr/bin/env python3
"""Einschlägigkeit vorab prüfen (Stundenlauf).

Ruft POST /api/relevance/prefill auf (Auth via CRON_SECRET aus
web/.env.local). Die Website gleicht dort für alle Kontoprofile
Profiländerungen ab und prüft nur Paare aus Profil und Update/Rahmenwerk, die
noch kein gespeichertes Ergebnis haben (neue Updates, unterbrochene
Komplettläufe). Bereits geprüfte Paare kosten nichts.
"""

import json
import urllib.request

from clear_newsletter_pending import ENV_LOCAL, read_env


def main() -> int:
    env = read_env(ENV_LOCAL)
    base = env.get("APP_URL") or ""
    if not base or "localhost" in base or "127.0.0.1" in base:
        base = "https://www.regradar.de"
    secret = env.get("CRON_SECRET")
    if not secret:
        print("relevance-prefill: CRON_SECRET fehlt in web/.env.local")
        return 0
    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/relevance/prefill",
        method="POST",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "User-Agent": "regradar-scraper/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=320) as resp:
        print("relevance-prefill:", json.load(resp))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
