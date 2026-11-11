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

# 3: Analyse über das Claude-Abo, präzisere Adressatengruppen, auch für
#    kuratierte Chronologie-Einträge und ganze Rahmenwerke (11.11.2026).
FORMAT = 3
DEFAULT_MODEL = "google/gemini-2.5-flash"
WORKERS = 6
TIMEOUT = 120

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULES_PATH = os.path.join(ROOT, "scraper", "SCOPE.md")
CATALOG_PATH = os.path.join(ROOT, "web", "lib", "relevance", "catalog.json")
DATA_TS = os.path.join(ROOT, "web", "lib", "data.ts")
LIVE_PATH = os.path.join(ROOT, "web", "lib", "live.json")
OUT_PATH = os.path.join(ROOT, "web", "lib", "relevance", "scopes.json")
# Alle Prüfziele der Website (auch kuratierte Chronologie-Einträge aus data.ts
# und die Rahmenwerke selbst), erzeugt von web/scripts/scope-targets.ts.
TARGETS_PATH = os.path.join(ROOT, "scraper", "data", "scope_targets.json")

FW_HINT = ("Analysiere das Rahmenwerk als Ganzes: Wer ist Normadressat des Rechtsakts und hat daraus unmittelbar eigene "
           "Pflichten? Mittelbare Berührung (als Kunde, Nutzer, Investor, Vertragspartner) reicht nicht. Regelwerke für "
           "bestimmte Anbieter (Ratingagenturen, Benchmark-Administratoren, Zentralverwahrer, Handelsplätze, "
           "Kryptowerte-Dienstleister) nur mit der passenden Institutsart oder Erlaubnis; freiwillige Standards und "
           "Labels sind 'keine_institute'. Querschnittsregeln (DORA, Geldwäsche, Datenschutz) mit allen betroffenen "
           "Institutsarten als eigene Gruppen. art ist 'pflicht', wenn das Rahmenwerk gilt, sonst 'kuenftig'.")

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


def _refresh_targets() -> None:
    """Zielliste neu erzeugen (best effort: fehlt Node, bleibt die alte Liste)."""
    import subprocess
    try:
        subprocess.run(["npx", "tsx", "scripts/scope-targets.ts", TARGETS_PATH], cwd=os.path.join(ROOT, "web"),
                       check=True, capture_output=True, timeout=180)
    except (OSError, subprocess.SubprocessError) as e:
        print("scope: Zielliste nicht aktualisiert ({})".format(e))


def _targets() -> dict:
    try:
        return json.load(open(TARGETS_PATH, encoding="utf-8"))
    except (OSError, ValueError):
        return {"updates": [], "frameworks": []}


# Standard seit 11.11.2026 (Nutzerentscheidung): Die Analyse läuft über das
# Claude-Abo (claude -p), nicht über die OpenRouter-API.
# SCOPE_BACKEND=openrouter schaltet auf die API zurück.
#
# Aufbau des Laufs (Nutzervorgaben 11.11.2026):
# - Kleine Pakete (5 Meldungen), viele parallel. Jedes Paket wird gespeichert,
#   sobald es fertig ist; ein hängendes Paket hält kein anderes auf und bricht
#   nach CLAUDE_TIMEOUT ab. Was fehlt, nimmt der nächste Lauf wieder auf.
# - Harter Token-Deckel: höchstens SCOPE_TOKEN_CAP Tokens in 7 Tagen
#   (Standard 1 Mio.). Gezählt wird, was der Aufruf meldet: Eingabe, Ausgabe
#   und neu angelegter Cache voll, aus dem Cache gelesene Tokens zu 10 %.
# - Ohne Nachdenken (MAX_THINKING_TOKENS=0), ohne Werkzeuge, eigener
#   System-Prompt: Mit Nachdenken brauchte ein Paket rund 12.000 statt
#   1.500 Ausgabe-Tokens und 156 statt etwa 30 Sekunden.
CLAUDE_BATCH = int(os.environ.get("SCOPE_CLAUDE_BATCH", "5"))
CLAUDE_WORKERS = int(os.environ.get("SCOPE_CLAUDE_WORKERS", "10"))
CLAUDE_TIMEOUT = 240
TOKEN_CAP = int(os.environ.get("SCOPE_TOKEN_CAP", "1000000"))
# Reserve je laufendem Paket, damit der Deckel auch bei parallelen Paketen hält.
TOKENS_PER_BATCH_EST = 6000

OUTPUT_RULES = (
    "\n\nAUSGABE: Du bekommst mehrere Meldungen als nummerierte Liste. Analysiere jede für sich. Antworte "
    'ausschließlich mit EINEM JSON-Objekt {"1": {…}, "2": {…}} mit einem Eintrag je Nummer, kompakt in einer Zeile ohne '
    'Einrückung und ohne Code-Zaun. Halte dich sehr kurz: "hinweis" weglassen, außer er ist für die Abgrenzung nötig '
    '(höchstens 8 Wörter); "kurz" und "handlung" je ein Satz mit höchstens 20 Wörtern; "normen" höchstens 3; '
    '"belege": []; "fragen" höchstens 2; leere Listen als [].')


def _ensure_token_table(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS llm_scope_tokens (at TEXT NOT NULL, tokens INTEGER NOT NULL)")
    conn.commit()


def _tokens_used(conn: sqlite3.Connection) -> int:
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7)).isoformat()
    row = conn.execute("SELECT COALESCE(SUM(tokens),0) FROM llm_scope_tokens WHERE at >= ?", (since,)).fetchone()
    return int(row[0] or 0)


def _chat_claude(system: str, users: List[str]):
    """Ein Aufruf für mehrere Meldungen. Liefert (Ergebnisse in Eingabe-
    Reihenfolge, verbrauchte Tokens)."""
    import shutil
    import subprocess
    exe = shutil.which("claude") or "/usr/local/bin/claude"
    prompt = "MELDUNGEN:\n" + "\n".join("{}: {}".format(i + 1, u) for i, u in enumerate(users))
    env = dict(os.environ)
    # Ohne ANTHROPIC_*-Variablen greift der claude.ai-Login (Abo-Kontingent).
    for k in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"):
        env.pop(k, None)
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin:" + env.get("PATH", "")
    env["MAX_THINKING_TOKENS"] = "0"
    # Harte Obergrenze je Paket: Zwei Ausreißer mit rund 140.000 Tokens haben
    # am 11.11.2026 ein Viertel des Deckels verbraucht. Ein abgeschnittenes
    # Paket zählt als Fehler und wird im nächsten Lauf neu versucht.
    env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = str(600 * len(users) + 500)
    cmd = [exe, "-p", prompt, "--system-prompt", system + OUTPUT_RULES, "--tools", "", "--output-format", "json",
           "--max-turns", "1", "--no-session-persistence",
           "--model", os.environ.get("SCOPE_CLAUDE_MODEL", "sonnet"),
           "--setting-sources", "project,local", "--disable-slash-commands"]
    p = subprocess.run(cmd, cwd="/tmp", capture_output=True, text=True, timeout=CLAUDE_TIMEOUT, env=env)
    data = json.loads(p.stdout.strip().splitlines()[-1])
    u = data.get("usage") or {}
    tokens = int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0) \
        + int(u.get("cache_creation_input_tokens") or 0) + int(u.get("cache_read_input_tokens") or 0) // 10
    if tokens > 30000:
        # Ausreißer festhalten: am 11.11.2026 meldeten einzelne Pakete 120.000 bis
        # 250.000 Tokens bei rund 40 Sekunden Laufzeit; die Ursache ist offen.
        print("scope: Ausreißer {} Tokens, usage={}".format(tokens, json.dumps(u)[:600]), flush=True)
    if p.returncode != 0 or data.get("is_error"):
        print("scope: Aufruf abgelehnt: {}".format(str(data.get("result"))[:200]), flush=True)
        return [None] * len(users), tokens
    text = str(data.get("result") or "")
    try:
        parsed = json.loads(text[text.find("{"):text.rfind("}") + 1])
    except ValueError:
        return [None] * len(users), tokens
    return [parsed.get(str(i + 1)) if isinstance(parsed.get(str(i + 1)), dict) else None
            for i in range(len(users))], tokens


def _lock_held(lock: str) -> bool:
    """Sperre gilt nur, solange der eingetragene Prozess lebt (nach einem
    Neustart des Rechners ist sie damit sofort frei)."""
    try:
        pid = int(open(lock).read().strip() or 0)
        os.kill(pid, 0)
        return pid != os.getpid()
    except (OSError, ValueError):
        return False


def _refresh_targets() -> None:
    """Zielliste neu erzeugen (best effort: fehlt Node, bleibt die alte Liste)."""
    import subprocess
    try:
        subprocess.run(["npx", "tsx", "scripts/scope-targets.ts", TARGETS_PATH], cwd=os.path.join(ROOT, "web"),
                       check=True, capture_output=True, timeout=180)
    except (OSError, subprocess.SubprocessError) as e:
        print("scope: Zielliste nicht aktualisiert ({})".format(e))


def _targets() -> dict:
    try:
        return json.load(open(TARGETS_PATH, encoding="utf-8"))
    except (OSError, ValueError):
        return {"updates": [], "frameworks": []}
def _live_items() -> List[dict]:
    """Alle Prüfziele: Updates aus live.json, kuratierte Einträge aus data.ts
    und die Rahmenwerke selbst (Schlüssel "f:<id>" statt URL)."""
    live = json.load(open(LIVE_PATH, encoding="utf-8"))
    items = []
    seen = set()
    for fw_id, ups in live["updates"].items():
        for u in ups:
            if u.get("url") and u["url"] not in seen:
                seen.add(u["url"])
                items.append({"fw": fw_id, **u})
    targets = _targets()
    for u in targets["updates"]:
        if u.get("url") and u["url"] not in seen:
            seen.add(u["url"])
            items.append(u)
    items.sort(key=lambda u: tuple(reversed(u["d"].split("."))), reverse=True)
    for f in targets["frameworks"]:
        items.append({
            "fw": f["id"], "url": "f:" + f["id"], "d": "", "src": "", "framework": True,
            "ti": {"de": "Rahmenwerk {} ({})".format(f["name"], f["ref"])}, "t": {"de": "Rahmenwerk"},
            "s": {"de": f["about"]},
        })
    return items


def analyze(conn: sqlite3.Connection, backfill: bool = False, limit: Optional[int] = None) -> dict:
    _ensure_table(conn)
    _refresh_targets()
    items = _live_items()
    if limit:
        items = items[:limit]
    cached = {r[0] for r in conn.execute("SELECT url FROM llm_scope WHERE fmt=?", (FORMAT,))}
    older = {r[0] for r in conn.execute("SELECT url FROM llm_scope WHERE fmt<?", (FORMAT,))}
    # Erst Ziele ganz ohne Analyse (sie haben auf der Website nur die
    # vorläufige Einschätzung), danach ältere Fassungen, soweit der
    # Token-Deckel reicht.
    # Rahmenwerke zuerst: Ihre Analyse gilt auf der Website auch für jedes
    # Update ohne eigene Analyse (scopes.ts, scopeForTarget).
    fresh = [u for u in items if u["url"] not in cached and u["url"] not in older]
    todo = [u for u in fresh if u.get("framework")] + [u for u in fresh if not u.get("framework")] \
        + [u for u in items if u["url"] not in cached and u["url"] in older]
    use_claude = os.environ.get("SCOPE_BACKEND", "claude") != "openrouter"
    key = "abo" if use_claude else api_key()
    stats = {"total": len(items), "neu": 0, "fehler": 0, "kosten_usd": 0.0, "gebremst": False}
    if todo and key:
        budget = float(os.environ.get("SCOPE_WEEKLY_BUDGET_USD", "0.8"))
        spent = _spent_this_week(conn)
        if not use_claude and not backfill and spent >= budget:
            stats["gebremst"] = True
            todo = []
        features = _catalog()
        ids = {f["id"] for f in features}
        fws = _frameworks()
        system = _rules() + "\n\nMERKMALSKATALOG (id: Bedeutung):\n" + "\n".join(
            "{}: {}".format(f["id"], f["l"]) for f in features)
        model = os.environ.get("OPENROUTER_SCOPE_MODEL", DEFAULT_MODEL)
        from .db import utcnow

        def slim(f):
            return {k: f[k] for k in ("name", "ref", "jur", "ents") if f and f.get(k)} if f else None

        def payload(u):
            fw = fws.get(u["fw"], {"id": u["fw"]})
            parent = fws.get(fw.get("parent") or "")
            if use_claude:
                # Schlanke Eingabe (Token-Deckel): Stammdaten des Rahmenwerks ohne Fließtext.
                return json.dumps({
                    "meldung": {"titel": u["ti"]["de"], "typ": u["t"]["de"], "quelle": u["src"], "datum": u["d"],
                                "frist": u.get("deadline"), "zusammenfassung": u["s"]["de"]},
                    "rahmenwerk": slim(fw), **({"eltern_rahmenwerk": slim(parent)} if parent else {}),
                    **({"hinweis": FW_HINT} if u.get("framework") else {}),
                }, ensure_ascii=False)
            return json.dumps({
                "meldung": {"titel": u["ti"]["de"], "typ": u["t"]["de"], "quelle": u["src"],
                            "datum": u["d"], "frist": u.get("deadline"), "referenz": u.get("refnum"),
                            "zusammenfassung": u["s"]["de"], "url": u["url"]},
                "rahmenwerk": fw,
                "eltern_rahmenwerk": parent,
                **({"hinweis": FW_HINT} if u.get("framework") else {}),
            }, ensure_ascii=False)

        def save(url, scope, cost, used_model):
            stats["kosten_usd"] += cost
            if scope is None:
                stats["fehler"] += 1
                return
            conn.execute("INSERT OR REPLACE INTO llm_scope VALUES (?,?,?,?,?,?)",
                         (url, json.dumps(scope, ensure_ascii=False), used_model, cost, utcnow(), FORMAT))
            conn.commit()
            stats["neu"] += 1

        # Nur ein Lauf zur Zeit (Stundenlauf und Nachlauf-Agent).
        lock = os.path.join(ROOT, "scraper", "data", ".scope_claude.lock")
        if use_claude and _lock_held(lock):
            print("scope: anderer Lauf aktiv, überspringe")
            todo = []
            use_claude = False
        if use_claude:
            from concurrent.futures import FIRST_COMPLETED, wait
            with open(lock, "w") as f:
                f.write(str(os.getpid()))
            _ensure_token_table(conn)
            used = _tokens_used(conn)
            claude_model = "claude:" + os.environ.get("SCOPE_CLAUDE_MODEL", "sonnet")
            batches = [todo[i:i + CLAUDE_BATCH] for i in range(0, len(todo), CLAUDE_BATCH)]
            stats["tokens"] = 0
            pool = ThreadPoolExecutor(max_workers=CLAUDE_WORKERS)
            running = {}
            nxt = 0
            done_n = 0
            try:
                while nxt < len(batches) or running:
                    # Neue Pakete nur, solange der Deckel auch mit allen
                    # laufenden Paketen sicher hält.
                    while nxt < len(batches) and len(running) < CLAUDE_WORKERS:
                        if used + (len(running) + 1) * TOKENS_PER_BATCH_EST > TOKEN_CAP:
                            stats["gebremst"] = True
                            nxt = len(batches)
                            break
                        b = batches[nxt]
                        running[pool.submit(_chat_claude, system, [payload(u) for u in b])] = b
                        nxt += 1
                    if not running:
                        break
                    finished, _ = wait(list(running), return_when=FIRST_COMPLETED)
                    for fut in finished:
                        b = running.pop(fut)
                        done_n += 1
                        try:
                            raws, tokens = fut.result()
                        except Exception as e:  # Timeout, kaputte Ausgabe
                            print("scope: Paket fehlgeschlagen ({} Meldungen): {}".format(len(b), str(e)[:160]), flush=True)
                            raws, tokens = [None] * len(b), TOKENS_PER_BATCH_EST
                        used += tokens
                        stats["tokens"] += tokens
                        conn.execute("INSERT INTO llm_scope_tokens VALUES (?,?)", (utcnow(), tokens))
                        for u, r in zip(b, raws):
                            save(u["url"], _clean(r, ids) if r else None, 0.0, claude_model)
                        if done_n % 10 == 0:
                            print("scope: {}/{} Pakete, {} Tokens (7 Tage: {})".format(
                                done_n, len(batches), stats["tokens"], used), flush=True)
                            write_export(conn)
            finally:
                pool.shutdown(wait=False, cancel_futures=True)
                try:
                    os.remove(lock)
                except OSError:
                    pass
            todo = []

        def work(u):
            fw = fws.get(u["fw"], {"id": u["fw"]})
            parent = fws.get(fw.get("parent") or "")
            user = json.dumps({
                "meldung": {"titel": u["ti"]["de"], "typ": u["t"]["de"], "quelle": u["src"],
                            "datum": u["d"], "frist": u.get("deadline"), "referenz": u.get("refnum"),
                            "zusammenfassung": u["s"]["de"], "url": u["url"]},
                "rahmenwerk": fw,
                "eltern_rahmenwerk": parent,
                **({"hinweis": FW_HINT} if u.get("framework") else {}),
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


KWG_DORA_HINT = ("§ 1a Abs. 2a KWG: DORA gilt entsprechend (Meldepflichten seit 17.01.2025, Rest ab 01.01.2027; "
                 "vereinfachter IKT-Rahmen Art. 16, kein TLPT, Drittparteienregeln nicht für Kleinstunternehmen).")
NIS2_HINT = (" Ab 01.01.2027 gilt DORA für KWG-Institute außerhalb von Art. 2 DORA entsprechend (§ 1a Abs. 2a KWG); "
             "dann sind sie nach § 28 Abs. 6 BSIG von §§ 30, 31, 32, 35, 36, 38 und 39 BSIG ausgenommen, die Registrierung "
             "nach § 33 BSIG bleibt.")


def extend_dora_kwg(scope: dict) -> dict:
    """Deterministische Nachbearbeitung beim Export (kein Neulauf der KI nötig).

    Nach § 1a Abs. 2a i. V. m. § 65a Abs. 3 KWG gilt DORA entsprechend für alle
    KWG-Institute, die nicht schon unter Art. 2 DORA fallen (Leasing, Factoring,
    übrige Finanzdienstleistungsinstitute, Kreditinstitute ohne CRR-Status).
    Hat eine DORA-Meldung eine Gruppe mit "fdi" oder "ki_crr", wird sie für
    "leasing_factoring" bzw. "ki" gespiegelt (Zusätze wie sitz_de bleiben).
    Luxemburg (CSSF) ist ausgenommen, das KWG gilt dort nicht. NIS-2-Meldungen
    bekommen einen Zeitvermerk, weil der Satz „nicht unter DORA“ ab 2027 nicht
    mehr für diese Institute stimmt."""
    normen = " ".join(scope.get("normen") or [])
    groups = scope.get("adressaten") or []
    if not groups or scope.get("art") == "keine_institute":
        return scope
    if any("sitz_lu" in g["alle"] for g in groups):
        return scope
    if "2022/2554" in normen or "DORA" in normen:
        have = {tuple(sorted(g["alle"])) for g in groups}
        for g in list(groups):
            for src, dst in (("fdi", "leasing_factoring"), ("ki_crr", "ki")):
                if src in g["alle"] and dst not in g["alle"]:
                    new = sorted({dst if f == src else f for f in g["alle"]})
                    if tuple(new) in have:
                        continue
                    have.add(tuple(new))
                    groups.append({"alle": new, "hinweis": KWG_DORA_HINT})
    elif "2022/2555" in normen or "NIS" in normen:
        for g in groups:
            h = g.get("hinweis") or ""
            if "leasing_factoring" in g["alle"] or "fdi" in g["alle"]:
                if NIS2_HINT.strip() not in h:
                    g["hinweis"] = (h.rstrip() + NIS2_HINT) if h else NIS2_HINT.strip()
    return scope


def write_export(conn: sqlite3.Connection) -> int:
    """scopes.json mit allen gecachten Analysen der aktuellen live.json-Updates."""
    _ensure_table(conn)
    urls = {u["url"] for u in _live_items()}
    out = {}
    # Neueste Fassung je URL; ältere Formate bleiben bis zur Neuanalyse im
    # Export (z. B. wenn das Wochenbudget die Neuanalyse bremst).
    for url, scope in conn.execute("SELECT url, scope FROM llm_scope ORDER BY fmt"):
        if url in urls:
            out[url] = extend_dora_kwg(json.loads(scope))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"format": FORMAT, "scopes": out}, f, ensure_ascii=False, separators=(",", ":"))
    return len(out)
