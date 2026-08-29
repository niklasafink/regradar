"""Lücken-Report: Big-4-/Kanzlei-Artikel ohne gescrapte Primärquelle.

Ziel: erkennen, wenn PwC, KPMG, Deloitte & Co. über ein regulatorisches
Vorhaben schreiben, zu dem der Scraper KEIN Behörden-Dokument (BaFin, EBA,
ESMA, EU …) kennt — das ist ein Signal, dass eine neue Quelle bzw. ein
neuer Scraper fehlt. Der Betreiber bekommt dazu maximal einmal pro Tag
eine E-Mail (Resend) mit den Artikeln, nach Themen gruppiert.

Strenge Prüfung in vier Stufen, damit nur echte Lücken gemeldet werden:
  1. Nur frische Artikel (Publikationsdatum letzte 14 Tage); Artikel, die
     der bestehende Big4-Match bereits einem Dokument zugeordnet hat
     (big4_matches.related=1), sind abgedeckt.
  2. LLM-Relevanzfilter (gleiche Kriterien wie llmfilter): Steuerurteile,
     Kanzlei-PR u. Ä. ohne Aufsichtsbezug fliegen raus (Cache in
     big4_gap_relevance).
  3. Ein LLM vergleicht jeden verbleibenden Artikel gegen die gescrapten
     Dokumente der letzten 180 Tage (gleiches Rahmenwerk; ohne Rahmenwerk
     gegen die neuesten Dokumente insgesamt). Im Zweifel gilt: abgedeckt.
  4. Ohne OPENROUTER_API_KEY wird NICHT berichtet (lieber keine Mail als
     eine falsche Lücken-Meldung).

Jeder Artikel wird höchstens einmal gemeldet (Tabelle big4_gap_reported);
pro Kalendertag geht höchstens eine Mail raus (Tabelle big4_gap_runs).
"""
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Optional

from .db import utcnow

RESEND_URL = "https://api.resend.com/emails"
PUBLISHED_WINDOW_DAYS = 14    # nur frisch publizierte Artikel betrachten
DOC_WINDOW_DAYS = 180         # gescrapte Dokumente: Vergleichszeitraum
DOCS_PER_FRAMEWORK = 30       # Dokumente pro LLM-Vergleich
ARTICLE_BATCH_MAX = 12        # Artikel pro LLM-Anfrage
TIMEOUT = 90

COVER_PROMPT = (
    "Du prüfst für einen Regulatory-Monitoring-Dienst, ob Fachbeiträge von "
    "Beratungsgesellschaften/Kanzleien durch bereits erfasste Behörden-"
    "Dokumente (BaFin, EBA, ESMA, EU-Kommission, EZB, Gesetzgebung …) "
    "abgedeckt sind.\n\n"
    "Du erhältst eine JSON-Liste 'dokumente' (erfasste Primärquellen: Titel, "
    "Behörde, Datum) und eine Liste 'artikel' (id, title, teaser).\n\n"
    "Ein Artikel ist ABGEDECKT (true), wenn mindestens ein Dokument dasselbe "
    "regulatorische Vorhaben, dieselbe Verlautbarung oder dasselbe konkrete "
    "Thema behandelt — auch wenn der Artikel nur eine Facette davon "
    "kommentiert. Ein Artikel ist NICHT abgedeckt (false), wenn KEIN "
    "Dokument sein Kernthema behandelt, der Artikel sich also auf eine "
    "Quelle stützt, die hier offensichtlich fehlt (z. B. andere Behörde, "
    "nationales Gesetzgebungsverfahren, internationales Gremium).\n"
    "Im Zweifel: true (abgedeckt).\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt, das jede Artikel-id auf "
    "true oder false abbildet. Keine Erklärungen."
)

GROUP_PROMPT = (
    "Du gruppierst Fachbeiträge von Beratungsgesellschaften nach Thema. "
    "Beiträge zum selben regulatorischen Vorhaben/Thema gehören in eine "
    "Gruppe; ein Beitrag ohne thematische Nachbarn bildet eine eigene "
    "Gruppe. Du erhältst eine JSON-Liste mit id und title.\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt der Form "
    '{"gruppen": [{"thema": "kurzer deutscher Titel", "ids": [1, 2]}]}. '
    "Jede id genau einmal. Keine Erklärungen."
)


# --------------------------------------------------------------- Persistenz

def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS big4_gap_reported (
               article_id  INTEGER PRIMARY KEY,
               reported_at TEXT NOT NULL
           )""")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS big4_gap_runs (
               run_date TEXT PRIMARY KEY,   -- YYYY-MM-DD (UTC)
               sent     INTEGER NOT NULL,
               articles INTEGER NOT NULL
           )""")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS big4_gap_relevance (
               article_id INTEGER PRIMARY KEY,
               relevant   INTEGER NOT NULL,
               checked_at TEXT NOT NULL
           )""")
    conn.commit()


# --------------------------------------------------------------- Env/Mail

def _load_web_env() -> None:
    """RESEND_API_KEY/RESEND_FROM liegen in web/.env.local — nachladen,
    falls sie nicht ohnehin in scraper/.env bzw. der Umgebung stehen."""
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "web", ".env.local")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip("'\"")
            if key.startswith("RESEND") and value and key not in os.environ:
                os.environ[key] = value


def _send_email(subject: str, html: str) -> Optional[str]:
    """Mail via Resend; Rückgabe ist eine Fehlermeldung oder None."""
    _load_web_env()
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return "RESEND_API_KEY fehlt (scraper/.env oder web/.env.local)"
    payload = {
        "from": "Niklas von RegRadar <{}>".format(
            os.environ.get("RESEND_FROM") or "onboarding@resend.dev"),
        "to": [os.environ.get("NOTIFY_EMAIL") or "niklas.fink@hotmail.de"],
        "subject": subject,
        "html": html,
    }
    req = urllib.request.Request(
        RESEND_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer {}".format(key),
                 "Content-Type": "application/json",
                 # Cloudflare vor api.resend.com blockt den urllib-Default-UA.
                 "User-Agent": "regradar-gap-report/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            if resp.status not in (200, 201):
                return "Resend HTTP {}".format(resp.status)
    except urllib.error.HTTPError as e:
        return "Resend HTTP {}: {}".format(e.code, e.read().decode()[:200])
    except (urllib.error.URLError, TimeoutError) as e:
        return str(e)
    return None


# --------------------------------------------------------------- LLM-Hilfen

def _chat_json(system: str, user_payload) -> Optional[dict]:
    """Eine JSON-Antwort vom LLM (OpenRouter); None bei Fehler."""
    from .llmfilter import API_URL, DEFAULT_MODEL, api_key
    key = api_key()
    if not key:
        return None
    payload = {
        "model": os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL,
        "temperature": 0,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",
             "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer {}".format(key),
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"].strip()
        content = content.removeprefix("```json").removeprefix("```").removesuffix("```")
        return json.loads(content)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, TimeoutError) as e:
        print("Gap-Report: LLM-Anfrage übersprungen ({}: {})".format(type(e).__name__, e))
        return None


def _clean(text: Optional[str], limit: int) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = " ".join(text.split())
    return text[:limit]


# --------------------------------------------------------------- Kernlogik

def _candidates(conn: sqlite3.Connection) -> List[sqlite3.Row]:
    """Frisch publizierte Artikel ohne bestätigten Dokument-Match und ohne
    frühere Lücken-Meldung."""
    return conn.execute(
        """SELECT a.article_id, a.firm, a.url, a.title, a.teaser, a.published,
                  a.framework
           FROM big4_articles a
           WHERE a.published >= date('now', ?)
             AND a.article_id NOT IN (SELECT article_id FROM big4_gap_reported)
             AND NOT EXISTS (SELECT 1 FROM big4_matches m
                             WHERE m.article_id = a.article_id AND m.related = 1)
           ORDER BY a.published DESC, a.article_id DESC""",
        ("-{} days".format(PUBLISHED_WINDOW_DAYS),)).fetchall()


def _relevant_only(conn: sqlite3.Connection,
                   articles: List[sqlite3.Row]) -> List[sqlite3.Row]:
    """LLM-Relevanzfilter (Kriterien wie llmfilter): Steuerthemen, Awards,
    allgemeine Kanzlei-Beiträge ohne Aufsichtsbezug aussortieren. Urteile
    werden pro Artikel gecacht; ohne Urteil gilt der Artikel als nicht
    relevant (konservativ: keine falsche Lücken-Meldung)."""
    from .llmfilter import SYSTEM_PROMPT
    cached = {r["article_id"]: bool(r["relevant"]) for r in conn.execute(
        "SELECT article_id, relevant FROM big4_gap_relevance")}
    todo = [a for a in articles if a["article_id"] not in cached]
    for start in range(0, len(todo), ARTICLE_BATCH_MAX):
        batch = todo[start:start + ARTICLE_BATCH_MAX]
        parsed = _chat_json(SYSTEM_PROMPT, [
            {"id": a["article_id"],
             "text": "{} – {}".format(_clean(a["title"], 200),
                                      _clean(a["teaser"], 300))}
            for a in batch])
        if parsed is None:
            continue  # Fehler: nicht cachen, nächster Lauf versucht es erneut
        now = utcnow()
        for a in batch:
            v = parsed.get(str(a["article_id"]), parsed.get(a["article_id"]))
            if isinstance(v, bool):
                cached[a["article_id"]] = v
                conn.execute(
                    "INSERT OR REPLACE INTO big4_gap_relevance VALUES (?,?,?)",
                    (a["article_id"], int(v), now))
    conn.commit()
    return [a for a in articles if cached.get(a["article_id"])]


def _recent_documents(conn: sqlite3.Connection) -> List[dict]:
    """Gescrapte Dokumente der letzten DOC_WINDOW_DAYS inkl. Rahmenwerk."""
    from .webexport import _classify
    rows = conn.execute(
        """SELECT title, summary, authority, canonical_url,
                  COALESCE(publication_date, substr(first_seen_at, 1, 10)) AS d
           FROM documents
           WHERE COALESCE(publication_date, substr(first_seen_at, 1, 10)) >= date('now', ?)
           ORDER BY d DESC""",
        ("-{} days".format(DOC_WINDOW_DAYS),)).fetchall()
    docs = []
    for r in rows:
        docs.append({
            "titel": _clean(r["title"], 180),
            "behoerde": r["authority"] or "",
            "datum": r["d"] or "",
            "fw": _classify("{} {}".format(r["title"] or "", r["summary"] or "")),
        })
    return docs


def _coverage(articles: List[sqlite3.Row], docs: List[dict]) -> Dict[int, bool]:
    """Streng per LLM prüfen, welche Artikel durch Dokumente abgedeckt sind.
    Artikel ohne LLM-Urteil gelten als abgedeckt (konservativ)."""
    by_fw: Dict[Optional[str], List[sqlite3.Row]] = {}
    for a in articles:
        by_fw.setdefault(a["framework"], []).append(a)

    covered: Dict[int, bool] = {}
    for fw, group in by_fw.items():
        if fw:
            relevant = [d for d in docs if d["fw"] == fw][:DOCS_PER_FRAMEWORK]
        else:
            relevant = docs[:DOCS_PER_FRAMEWORK]
        doc_list = [{"titel": d["titel"], "behoerde": d["behoerde"],
                     "datum": d["datum"]} for d in relevant]
        for start in range(0, len(group), ARTICLE_BATCH_MAX):
            batch = group[start:start + ARTICLE_BATCH_MAX]
            if not doc_list:
                # Kein einziges gescraptes Dokument im Themenfeld → Lücke.
                for a in batch:
                    covered[a["article_id"]] = False
                continue
            parsed = _chat_json(COVER_PROMPT, {
                "dokumente": doc_list,
                "artikel": [{"id": a["article_id"],
                             "title": _clean(a["title"], 200),
                             "teaser": _clean(a["teaser"], 300)}
                            for a in batch],
            })
            for a in batch:
                v = None
                if parsed is not None:
                    v = parsed.get(str(a["article_id"]), parsed.get(a["article_id"]))
                # Ohne eindeutiges false gilt der Artikel als abgedeckt.
                covered[a["article_id"]] = v is not False
    return covered


def _group_by_topic(gaps: List[sqlite3.Row]) -> List[dict]:
    """Lücken-Artikel per LLM zu Themen aggregieren; Fallback: Rahmenwerk."""
    parsed = _chat_json(GROUP_PROMPT, {
        "beitraege": [{"id": a["article_id"], "title": _clean(a["title"], 200)}
                      for a in gaps]})
    by_id = {a["article_id"]: a for a in gaps}
    groups = []
    seen = set()
    if parsed and isinstance(parsed.get("gruppen"), list):
        for g in parsed["gruppen"]:
            ids = [i for i in (g.get("ids") or [])
                   if isinstance(i, int) and i in by_id and i not in seen]
            if not ids:
                continue
            seen.update(ids)
            groups.append({"thema": str(g.get("thema") or "Weitere Themen")[:120],
                           "artikel": [by_id[i] for i in ids]})
    rest = [a for a in gaps if a["article_id"] not in seen]
    if rest:
        by_fw: Dict[str, List[sqlite3.Row]] = {}
        for a in rest:
            by_fw.setdefault(a["framework"] or "Ohne Rahmenwerk-Zuordnung", []).append(a)
        for fw, items in by_fw.items():
            groups.append({"thema": fw, "artikel": items})
    return groups


def _de_date(iso: Optional[str]) -> str:
    if not iso or not re.match(r"\d{4}-\d{2}-\d{2}", iso):
        return ""
    y, m, d = iso[:10].split("-")
    return "{}.{}.{}".format(d, m, y)


def _render_email(groups: List[dict]) -> str:
    parts = [
        '<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">',
        '<p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>',
        "<p>Big-4-/Kanzlei-Beiträge zu Themen, zu denen <strong>keine gescrapte "
        "Primärquelle</strong> vorliegt — Kandidaten für einen neuen Scraper:</p>",
    ]
    for g in groups:
        parts.append(
            '<p style="margin:20px 0 6px;font-weight:600">{}</p>'.format(g["thema"]))
        parts.append('<ul style="margin:0;padding-left:20px">')
        for a in g["artikel"]:
            date = _de_date(a["published"])
            parts.append(
                '<li style="margin:4px 0">{firm}{date}: '
                '<a href="{url}" style="color:#0f172a">{title}</a></li>'.format(
                    firm=a["firm"],
                    date=", {}".format(date) if date else "",
                    url=a["url"],
                    title=_clean(a["title"], 200)))
        parts.append("</ul>")
    parts.append(
        '<p style="color:#64748b;font-size:13px;margin-top:24px">Streng geprüft '
        "gegen die gescrapten Dokumente der letzten {} Tage; jeder Beitrag wird "
        "nur einmal gemeldet. Max. eine Mail pro Tag.</p>".format(DOC_WINDOW_DAYS))
    parts.append("</div>")
    return "".join(parts)


def run(conn: sqlite3.Connection, force: bool = False) -> dict:
    """Lücken ermitteln und ggf. die Tages-Mail verschicken."""
    ensure_tables(conn)
    today = utcnow()[:10]
    if not force and conn.execute(
            "SELECT 1 FROM big4_gap_runs WHERE run_date=?", (today,)).fetchone():
        return {"status": "übersprungen (heute bereits gelaufen)", "gaps": 0}

    from .llmfilter import api_key
    if not api_key():
        return {"status": "übersprungen (kein OPENROUTER_API_KEY — keine "
                          "strenge Prüfung möglich)", "gaps": 0}

    candidates = _candidates(conn)
    if not candidates:
        conn.execute("INSERT OR REPLACE INTO big4_gap_runs VALUES (?,0,0)", (today,))
        conn.commit()
        return {"status": "keine neuen Artikel", "gaps": 0}

    articles = _relevant_only(conn, candidates)
    if not articles:
        conn.execute("INSERT OR REPLACE INTO big4_gap_runs VALUES (?,0,0)", (today,))
        conn.commit()
        return {"status": "keiner der {} Artikel regulatorisch relevant".format(
            len(candidates)), "gaps": 0}

    docs = _recent_documents(conn)
    covered = _coverage(articles, docs)
    gaps = [a for a in articles if covered.get(a["article_id"]) is False]

    if not gaps:
        conn.execute("INSERT OR REPLACE INTO big4_gap_runs VALUES (?,0,0)", (today,))
        conn.commit()
        return {"status": "alle {} Artikel abgedeckt".format(len(articles)), "gaps": 0}

    groups = _group_by_topic(gaps)
    subject = "Radar-Lücke: {} Beitrag/Beiträge ohne Primärquelle ({} Themen)".format(
        len(gaps), len(groups))
    err = _send_email(subject, _render_email(groups))
    if err:
        # Nichts als gemeldet markieren — nächster Lauf versucht es erneut.
        return {"status": "Mail fehlgeschlagen: {}".format(err), "gaps": len(gaps)}

    now = utcnow()
    for a in gaps:
        conn.execute("INSERT OR REPLACE INTO big4_gap_reported VALUES (?,?)",
                     (a["article_id"], now))
    conn.execute("INSERT OR REPLACE INTO big4_gap_runs VALUES (?,1,?)",
                 (today, len(gaps)))
    conn.commit()
    return {"status": "Mail verschickt", "gaps": len(gaps), "themen": len(groups),
            "geprüft": len(candidates)}
