"""Client für /api/radar (web/app/api/radar/route.ts): Entscheidungspunkte der
Radar-Checkliste. Auth über CRON_SECRET aus web/.env.local. Fehler werden als
RuntimeError gemeldet; die Mail im Gap-Report geht notfalls auch ohne Buttons raus."""
import json
import os
import urllib.error
import urllib.request
from typing import Dict, List, Optional

from .health import app_url, load_web_env

TIMEOUT = 60


def _call(method: str, query: str = "", body: Optional[dict] = None) -> dict:
    load_web_env()
    key = os.environ.get("CRON_SECRET")
    if not key:
        raise RuntimeError("CRON_SECRET fehlt (web/.env.local)")
    req = urllib.request.Request(
        app_url() + "/api/radar" + query, method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "User-Agent": "regradar-radar/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError("HTTP {}: {}".format(e.code, e.read().decode("utf-8", "replace")[:300]))
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError(str(e))


def upsert(items: List[dict]) -> Dict[str, str]:
    """Punkte anlegen; Rückgabe: Entscheidungs-URL je Punkt-Id."""
    return _call("POST", body={"action": "upsert", "items": items}).get("links") or {}


def fetch(statuses: List[str]) -> List[dict]:
    return _call("GET", "?status=" + ",".join(statuses)).get("items") or []


def post_analysis(item_id: str, proposal: str, code: str, links: List[dict]) -> None:
    _call("POST", body={"action": "analysis", "id": item_id, "proposal": proposal,
                        "code": code, "links": links})


def post_result(item_id: str, ok: bool, report: str) -> None:
    _call("POST", body={"action": "result", "id": item_id, "ok": ok, "report": report})
