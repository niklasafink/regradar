"""Anforderungsanalyse: für wen ist ein Update einschlägig?

Je Update (aus web/lib/live.json) bestimmt ein LLM nach scraper/SCOPE.md die
Soll-Institute in den Merkmalen des Katalogs web/lib/relevance/catalog.json:
Adressaten, Ausschlüsse, Teilregeln, Schwellen, Rückfragen, Normen, Belege.
Ergebnisse werden je URL in SQLite gecacht (versioniert über FORMAT) und als
web/lib/relevance/scopes.json exportiert. Den Abgleich mit einem konkreten
Institutsprofil macht die Website (web/lib/relevance/match.ts).

Aufruf: python3 -m regradar scope [--backfill] [--limit N]
Läuft außerdem am Ende von export-web für neue Updates.
"""
import datetime as dt
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

from .llmfilter import API_URL, api_key

FORMAT = 2
DEFAULT_MODEL = "google/gemini-2.5-flash"
WORKERS = 6
TIMEOUT = 120

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULES_PATH = os.path.join(ROOT, "scraper", "SCOPE.md")
CATALOG_PATH = os.path.join(ROOT, "web", "lib", "relevance", "catalog.json")
DATA_TS = os.path.join(ROOT, "web", "lib", "data.ts")
LIVE_PATH = os.path.join(ROOT, "web", "lib", "live.json")
OUT_PATH = os.path.join(ROOT, "web", "lib", "relevance", "scopes.json")

ARTS = ("pflicht", "kuenftig", "information", "keine_institute")


def _rules() -> str:
    text = open(RULES_PATH, encoding="utf-8").read()
    m = re.search(r"<!-- PROMPT-START -->(.*?)<!-- PROMPT-END -->", text, re.DOTALL)
    if not m:
        raise ValueError("SCOPE.md: PROMPT-Marker nicht gefunden")
    return m.group(1).strip()


def _catalog() -> List[dict]:
    return json.load(open(CATALOG_PATH, encoding="utf-8"))["features"]


def _frameworks() -> Dict[str, dict]:
    """Rahmenwerk-Stammdaten grob aus data.ts (id, Name, Rechtsakt, Zielgruppen,
    Bedingung, Beschreibung) – reicht als Kontext für die Analyse."""
    src = open(DATA_TS, encoding="utf-8").read()
    out: Dict[str, dict] = {}
    starts = [m.start() for m in re.finditer(r'\{ id:"[a-z0-9_]+", jur:', src)]
    for i, s in enumerate(starts):
        block = src[s:starts[i + 1] if i + 1 < len(starts) else len(src)]
        block = block.split("u:[", 1)[0]
        g = lambda pat: (re.search(pat, block, re.S) or [None, None])[1]  # noqa: E731
        fid = g(r'id:"([a-z0-9_]+)"')
        out[fid] = {
            "id": fid,
            "jur": g(r'jur:"([A-Z+]+)"'),
            "name": g(r'\bn:\{de:"(.*?)"'),
            "ref": g(r'\bref:"(.*?)"'),
            "ents": re.findall(r'"([A-Z]+)"', g(r"ents:\[(.*?)\]") or ""),
            "cond": g(r"cond:(\{.*?\}|null)"),
            "about": g(r'about:\{de:"(.*?)"'),
            "parent": g(r'parent:"([a-z0-9_]+)"'),
        }
    return out


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_scope (
               url        TEXT PRIMARY KEY,
               scope      TEXT NOT NULL,
               model      TEXT NOT NULL,
               cost_usd   REAL NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL,
               fmt        INTEGER NOT NULL
           )""")
    conn.commit()


def _week_start_iso() -> str:
    today = dt.datetime.now(dt.timezone.utc).date()
    return (today - dt.timedelta(days=today.weekday())).isoformat()


def _spent_this_week(conn: sqlite3.Connection) -> float:
    row = conn.execute("SELECT COALESCE(SUM(cost_usd),0) FROM llm_scope WHERE created_at >= ?",
                       (_week_start_iso(),)).fetchone()
    return float(row[0] or 0)


def _groups(raw, ids) -> List[dict]:
    out = []
    for g in raw if isinstance(raw, list) else []:
        if not isinstance(g, dict):
            continue
        alle = [x for x in (g.get("alle") or []) if x in ids]
        if alle:
            out.append({"alle": alle, **({"hinweis": str(g["hinweis"])[:200]} if g.get("hinweis") else {})})
    return out


def _clean(scope: dict, ids: set) -> dict:
    art = scope.get("art") if scope.get("art") in ARTS else "pflicht"
    teil = []
    for t in scope.get("teilregeln") or []:
        if isinstance(t, dict) and t.get("teil"):
            teil.append({"teil": str(t["teil"])[:160], "gilt_fuer": _groups(t.get("gilt_fuer"), ids),
                         "erleichterung": bool(t.get("erleichterung")),
                         "hinweis": str(t.get("hinweis") or "")[:300]})
    geltung = scope.get("geltung") if isinstance(scope.get("geltung"), dict) else {}
    return {
        "art": art,
        "kurz": str(scope.get("kurz") or "")[:300],
        "adressaten": [] if art == "keine_institute" else _groups(scope.get("adressaten"), ids),
        "ausschluesse": _groups(scope.get("ausschluesse"), ids),
        "ebene": scope.get("ebene") if scope.get("ebene") in ("einzel", "konsolidiert", "beide") else "einzel",
        "teilregeln": teil[:8],
        "schwellen": [{"merkmal": s["merkmal"], "beschreibung": str(s.get("beschreibung") or "")[:200]}
                      for s in scope.get("schwellen") or [] if isinstance(s, dict) and s.get("merkmal") in ids][:6],
        "fragen": [{"merkmal": f["merkmal"], "frage": str(f.get("frage") or "")[:200]}
                   for f in scope.get("fragen") or [] if isinstance(f, dict) and f.get("merkmal") in ids][:3],
        "handlung": str(scope.get("handlung") or "")[:500],
        "geltung": {"ab": geltung.get("ab"), "frist": geltung.get("frist")},
        "normen": [str(n)[:80] for n in scope.get("normen") or []][:10],
        "belege": [str(b)[:240] for b in scope.get("belege") or []][:3],
        "konfidenz": max(0.0, min(1.0, float(scope.get("konfidenz") or 0))),
    }


def _chat(model: str, key: str, system: str, user: str):
    payload = {
        "model": model, "temperature": 0, "max_tokens": 3000,
        "response_format": {"type": "json_object"},
        "usage": {"include": True},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode("utf-8"), headers={
        "Authorization": "Bearer {}".format(key), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"].strip()
    content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(content[content.find("{"):content.rfind("}") + 1]), float(
        (body.get("usage") or {}).get("cost") or 0)


def _live_items() -> List[dict]:
    live = json.load(open(LIVE_PATH, encoding="utf-8"))
    items = []
    for fw_id, ups in live["updates"].items():
        for u in ups:
            if u.get("url"):
                items.append({"fw": fw_id, **u})
    items.sort(key=lambda u: tuple(reversed(u["d"].split("."))), reverse=True)
    return items


def analyze(conn: sqlite3.Connection, backfill: bool = False, limit: Optional[int] = None) -> dict:
    _ensure_table(conn)
    items = _live_items()
    if limit:
        items = items[:limit]
    cached = {r[0] for r in conn.execute("SELECT url FROM llm_scope WHERE fmt=?", (FORMAT,))}
    todo = [u for u in items if u["url"] not in cached]
    key = api_key()
    stats = {"total": len(items), "neu": 0, "fehler": 0, "kosten_usd": 0.0, "gebremst": False}
    if todo and key:
        budget = float(os.environ.get("SCOPE_WEEKLY_BUDGET_USD", "0.8"))
        spent = _spent_this_week(conn)
        if not backfill and spent >= budget:
            stats["gebremst"] = True
            todo = []
        features = _catalog()
        ids = {f["id"] for f in features}
        fws = _frameworks()
        system = _rules() + "\n\nMERKMALSKATALOG (id: Bedeutung):\n" + "\n".join(
            "{}: {}".format(f["id"], f["l"]) for f in features)
        model = os.environ.get("OPENROUTER_SCOPE_MODEL", DEFAULT_MODEL)
        from .db import utcnow

        def work(u):
            fw = fws.get(u["fw"], {"id": u["fw"]})
            parent = fws.get(fw.get("parent") or "")
            user = json.dumps({
                "meldung": {"titel": u["ti"]["de"], "typ": u["t"]["de"], "quelle": u["src"],
                            "datum": u["d"], "frist": u.get("deadline"), "referenz": u.get("refnum"),
                            "zusammenfassung": u["s"]["de"], "url": u["url"]},
                "rahmenwerk": fw,
                "eltern_rahmenwerk": parent,
            }, ensure_ascii=False)
            for attempt in (1, 2):
                try:
                    raw, cost = _chat(model, key, system, user)
                    return u["url"], _clean(raw, ids), cost
                except (urllib.error.URLError, json.JSONDecodeError, KeyError, ValueError, OSError) as e:
                    err = e
            print("Scope-Analyse fehlgeschlagen: {} ({})".format(u["url"], err))
            return u["url"], None, 0.0

        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for url, scope, cost in pool.map(work, todo):
                stats["kosten_usd"] += cost
                if scope is None:
                    stats["fehler"] += 1
                    continue
                conn.execute("INSERT OR REPLACE INTO llm_scope VALUES (?,?,?,?,?,?)",
                             (url, json.dumps(scope, ensure_ascii=False), model, cost, utcnow(), FORMAT))
                conn.commit()
                stats["neu"] += 1
    write_export(conn)
    return stats


def write_export(conn: sqlite3.Connection) -> int:
    """scopes.json mit allen gecachten Analysen der aktuellen live.json-Updates."""
    _ensure_table(conn)
    urls = {u["url"] for u in _live_items()}
    out = {}
    # Neueste Fassung je URL; ältere Formate bleiben bis zur Neuanalyse im
    # Export (z. B. wenn das Wochenbudget die Neuanalyse bremst).
    for url, scope in conn.execute("SELECT url, scope FROM llm_scope ORDER BY fmt"):
        if url in urls:
            out[url] = json.loads(scope)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"format": FORMAT, "scopes": out}, f, ensure_ascii=False, separators=(",", ":"))
    return len(out)
