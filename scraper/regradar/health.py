"""Herzschlag der Scraper-Überwachung (Gegenstück zu web/lib/health.ts).

    python3 -m regradar heartbeat [--step=<name>=<ok|failed|skipped>]…
                                  [--exit=N] [--started=ISO] [--dry]

sammelt den Zustand aller Quellen (sources/crawl_runs), der Big4-Kanzleien
und der Pipeline-Schritte und schickt ihn an POST /api/health/heartbeat der
Website. Dort wird sofort bewertet: Quelle oder Schritt länger als 24 h ohne
Erfolg → Alarm-Mail an den Betreiber.

Die Schritt-Stände (letzter Erfolg je Schritt) liegen in data/health_steps.json,
damit sie den Neustart des Skripts überleben. Fehler beim Senden werden nur
gemeldet, nie geworfen — der Stundenlauf darf daran nicht scheitern.
Auth: das gemeinsame Geheimnis ist CRON_SECRET aus web/.env.local (liegt
identisch auf Vercel), alternativ HEALTH_SECRET in scraper/.env. Optional
HEALTH_APP_URL (Standard https://www.regradar.de) und HEALTH_CLAUDE_MODEL.
"""
import json
import os
import socket
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

from .db import utcnow
from .registry import SOURCES

STEPS = ("crawl", "big4", "dedup", "export", "push")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
STEP_FILE = os.path.join(DATA_DIR, "health_steps.json")
DEFAULT_APP_URL = "https://www.regradar.de"
TIMEOUT = 30


WEB_ENV_KEYS = ("CRON_SECRET", "HEALTH_SECRET", "HEALTH_APP_URL", "HEALTH_CLAUDE_MODEL")


def load_web_env() -> None:
    """Überwachungs-Schlüssel aus web/.env.local nachladen (nur die genannten
    Keys, ohne bereits gesetzte Variablen zu überschreiben)."""
    path = os.path.join(os.path.dirname(DATA_DIR), "..", "web", ".env.local")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip().strip("'\"")
                if key in WEB_ENV_KEYS and value and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        return


def secret() -> Optional[str]:
    load_web_env()
    return os.environ.get("HEALTH_SECRET") or os.environ.get("CRON_SECRET")


def app_url() -> str:
    load_web_env()
    return (os.environ.get("HEALTH_APP_URL") or DEFAULT_APP_URL).rstrip("/")


def parse_step_args(argv: List[str]) -> Tuple[Dict[str, str], Optional[int], Optional[str], bool]:
    """--step=crawl=ok --exit=1 --started=… --dry → (steps, exit_code, started, dry)"""
    steps: Dict[str, str] = {}
    exit_code: Optional[int] = None
    started: Optional[str] = None
    dry = False
    for a in argv:
        if a.startswith("--step="):
            name, _, status = a[len("--step="):].partition("=")
            if name in STEPS:
                steps[name] = status or "ok"
        elif a.startswith("--exit="):
            try:
                exit_code = int(a[len("--exit="):])
            except ValueError:
                exit_code = None
        elif a.startswith("--started="):
            started = a[len("--started="):] or None
        elif a == "--dry":
            dry = True
    return steps, exit_code, started, dry


def load_steps(path: str = STEP_FILE) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError
    except (OSError, ValueError):
        data = {}
    data.setdefault("lastOk", {})
    data.setdefault("last", {})
    return data


def record_steps(steps: Dict[str, str], exit_code: Optional[int], started: Optional[str],
                 path: str = STEP_FILE) -> dict:
    """Schritt-Stände fortschreiben: ok/skipped zählen als Erfolg (Push ohne
    Änderungen ist kein Fehler)."""
    data = load_steps(path)
    now = utcnow()
    for name, status in steps.items():
        data["last"][name] = status
        if status in ("ok", "skipped"):
            data["lastOk"][name] = now
    if steps or exit_code is not None:
        data["run"] = {"startedAt": started, "finishedAt": now,
                       "exitCode": exit_code, "steps": dict(steps)}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return data


def collect_state(conn: sqlite3.Connection, steps_data: Optional[dict] = None) -> dict:
    names = {s["source_id"]: s["name"] for s in SOURCES}
    rows = conn.execute(
        """SELECT s.source_id, s.enabled, s.last_success_at, s.last_document_at,
                  (SELECT COUNT(*) FROM documents d WHERE d.source_id=s.source_id) AS docs,
                  (SELECT COUNT(*) FROM crawl_runs c WHERE c.source_id=s.source_id
                      AND c.status='ERROR' AND c.started_at > datetime('now','-7 days')) AS err7d,
                  (SELECT COALESCE(SUM(documents_new),0) FROM crawl_runs c WHERE c.source_id=s.source_id
                      AND c.started_at > datetime('now','-7 days')) AS new7d,
                  (SELECT started_at FROM crawl_runs c WHERE c.source_id=s.source_id
                      ORDER BY run_id DESC LIMIT 1) AS last_run_at,
                  (SELECT status FROM crawl_runs c WHERE c.source_id=s.source_id
                      ORDER BY run_id DESC LIMIT 1) AS last_run_status,
                  (SELECT error_message FROM crawl_runs c WHERE c.source_id=s.source_id
                      AND c.status='ERROR' ORDER BY run_id DESC LIMIT 1) AS last_error
           FROM sources s ORDER BY s.source_id""").fetchall()
    sources = []
    for r in rows:
        sources.append({
            "id": r["source_id"],
            "name": names.get(r["source_id"], r["source_id"]),
            "enabled": bool(r["enabled"]),
            "lastSuccessAt": r["last_success_at"],
            "lastDocumentAt": r["last_document_at"],
            "lastRunAt": r["last_run_at"],
            "lastRunStatus": r["last_run_status"],
            # Nur der Fehler des letzten Laufs ist relevant; ein alter Fehler
            # bei zwischenzeitlich erfolgreichem Lauf wäre irreführend.
            "lastError": (r["last_error"] or "")[:300] if r["last_run_status"] == "ERROR" else None,
            "docs": r["docs"],
            "newLast7d": r["new7d"],
            "errorsLast7d": r["err7d"],
        })
    big4 = []
    try:
        for r in conn.execute(
                "SELECT firm, COUNT(*) n, MAX(discovered_at) last FROM big4_articles GROUP BY firm ORDER BY firm"):
            big4.append({"firm": r["firm"], "articles": r["n"], "lastFoundAt": r["last"]})
    except sqlite3.OperationalError:
        pass
    steps_data = steps_data or load_steps()
    return {
        "v": 1,
        "sentAt": utcnow(),
        "host": socket.gethostname(),
        "run": steps_data.get("run"),
        "stepsLastOk": steps_data.get("lastOk", {}),
        "sources": sources,
        "big4": big4,
    }


def _request(method: str, path: str, body: Optional[dict] = None) -> Tuple[Optional[dict], Optional[str]]:
    """Aufruf der Überwachungs-API mit HEALTH_SECRET; (Antwort, Fehlertext)."""
    key = secret()
    if not key:
        return None, "CRON_SECRET (web/.env.local) bzw. HEALTH_SECRET (scraper/.env) fehlt"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        app_url() + path, data=data, method=method,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 # Cloudflare/Vercel blocken den urllib-Default-UA teils.
                 "User-Agent": "regradar-health/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read().decode("utf-8") or "{}"
        return json.loads(raw), None
    except urllib.error.HTTPError as e:
        return None, "HTTP {}: {}".format(e.code, e.read().decode("utf-8", "replace")[:200])
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        return None, str(e)


def send_heartbeat(state: dict) -> Tuple[Optional[dict], Optional[str]]:
    return _request("POST", "/api/health/heartbeat", state)


def cmd_heartbeat(conn: sqlite3.Connection, argv: List[str]) -> int:
    steps, exit_code, started, dry = parse_step_args(argv)
    data = record_steps(steps, exit_code, started) if (steps or exit_code is not None) else load_steps()
    state = collect_state(conn, data)
    if dry:
        print(json.dumps(state, ensure_ascii=False, indent=1))
        return 0
    resp, err = send_heartbeat(state)
    if err:
        print("Heartbeat nicht gesendet: " + err)
        return 0  # kein Fehler für den Lauf – die Überwachung meldet sich dann selbst
    problems = (resp or {}).get("problems") or []
    print("Heartbeat gesendet: {} Quellen, Schritte {}{}".format(
        len(state["sources"]),
        ", ".join("{}={}".format(k, v) for k, v in steps.items()) or "–",
        " – {} Problem(e): {}".format(len(problems), ", ".join(problems)) if problems else ""))
    if (resp or {}).get("mailError"):
        print("Alarm-Mail fehlgeschlagen: {}".format(resp["mailError"]))
    return 0
