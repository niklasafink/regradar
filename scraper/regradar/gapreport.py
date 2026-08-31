"""Lücken-Report: Big-4-/Kanzlei-Artikel ohne gescrapte Primärquelle sowie
möglicherweise fehlende Rahmenwerke in der Bibliothek.

Ziel: erkennen, wenn PwC, KPMG, Deloitte & Co. über ein regulatorisches
Vorhaben schreiben, zu dem der Scraper KEIN Behörden-Dokument (BaFin, EBA,
ESMA, EU …) kennt — das ist ein Signal, dass eine neue Quelle bzw. ein
neuer Scraper fehlt. Der Betreiber bekommt dazu maximal einmal pro Tag
eine E-Mail (Resend) mit den Artikeln, nach Themen gruppiert und je Thema
mit einer LLM-Einschätzung zu Relevanz und Aktualität für die
Financial-Services-Zielgruppe.

Zusätzlich prüft der Report neue gescrapte Meldungen, die KEINEM Rahmenwerk
der Web-Bibliothek (FRAMEWORK_RULES/web/lib/data.ts) zugeordnet werden
konnten: Ein LLM beurteilt, ob dahinter ein für die Zielgruppe relevantes,
in der Bibliothek fehlendes Rahmenwerk steckt — Vorschläge landen mit
Rechtsakt und Datum des Rahmenwerks in derselben Mail (jedes Rahmenwerk
wird nur einmal gemeldet, Tabelle gap_fw_reported).

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
    "Du gruppierst Fachbeiträge von Beratungsgesellschaften/Kanzleien nach "
    "Thema und beurteilst jede Gruppe für Compliance-Verantwortliche von "
    "Finanzunternehmen (Banken, Asset Manager/KVGen, Wertpapier- und "
    "Zahlungsinstitute, Versicherer, FinTechs). Beiträge zum selben "
    "regulatorischen Vorhaben/Thema gehören in eine Gruppe; ein Beitrag "
    "ohne thematische Nachbarn bildet eine eigene Gruppe. Du erhältst eine "
    "JSON-Liste mit id, title und datum (Publikationsdatum).\n\n"
    "Je Gruppe zusätzlich:\n"
    "- relevanz: hoch|mittel|niedrig für die Zielgruppe\n"
    "- aktualitaet: 1 kurzer deutscher Satz, wie aktuell/dringlich das Thema "
    "ist (anhand der Publikationsdaten und des regulatorischen Stands)\n"
    "- rahmenwerk: deutet das Thema auf ein eigenständiges Regelwerk, dessen "
    "Name samt Rechtsakt UND Datum des Rechtsakts (z. B. 'ECSPR – VO (EU) "
    "2020/1503 vom 07.10.2020'), sonst leerer String\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt der Form "
    '{"gruppen": [{"thema": "kurzer deutscher Titel", "ids": [1, 2], '
    '"relevanz": "hoch", "aktualitaet": "…", "rahmenwerk": ""}]}. '
    "Jede id genau einmal. Keine Erklärungen."
)

RECO_PROMPT = (
    "Du bist der Assistent des Betreibers eines Regulatory-Monitoring-"
    "Dienstes für Finanzunternehmen und gibst zu jedem Punkt seiner "
    "Tages-Checkliste eine Empfehlung ab. Punktarten und erlaubte "
    "Empfehlungen:\n"
    "- dublette (zwei Einträge mit gleichem Titel und größerem zeitlichem "
    "Abstand): 'eigenstaendig' (beide behalten), 'dublette-behalte-a' oder "
    "'dublette-behalte-b' (der jeweils andere Eintrag wird unterdrückt). "
    "Indizien: gleiche URL-Struktur mit neuem Slug oder neuem Datum im Pfad "
    "spricht für Neuveröffentlichung desselben Inhalts; aktualisierte "
    "Listen/Statistiken/Rundschreiben mit neuem Stand sowie anonymisierte "
    "Einzelmaßnahmen zu verschiedenen Daten sind eigenständig; reine "
    "Sprachfassungen (en/de) desselben Dokuments sind Dubletten (behalte die "
    "deutsche bzw. die mit echtem Publikationsdatum).\n"
    "- rahmenwerk (Vorschlag, ein Regelwerk in die Bibliothek aufzunehmen): "
    "'aufnehmen' oder 'ignorieren' — Maßstab ist die Compliance-Relevanz "
    "für Banken, Asset Manager, Wertpapier-/Zahlungsinstitute, Versicherer, "
    "FinTechs.\n"
    "- scraper (Big4-/Kanzlei-Thema ohne gescrapte Primärquelle): "
    "'neue-quelle' (Primärquelle lohnt einen eigenen Scraper), 'abgedeckt' "
    "(vermutlich doch von bestehenden Quellen abgedeckt) oder 'ignorieren' "
    "(für die Zielgruppe verzichtbar).\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt der Form "
    '{"empfehlungen": [{"id": "d1", "empfehlung": "…", '
    '"grund": "1 kurzer deutscher Satz"}]}. Jede Punkt-id genau einmal. '
    "Keine Erklärungen außerhalb des JSON."
)

FW_GAP_PROMPT = (
    "Du prüfst für einen Regulatory-Monitoring-Dienst für Finanzunternehmen "
    "(Banken, Asset Manager/KVGen, Wertpapierinstitute, Zahlungs- und "
    "E-Geld-Institute, Versicherer, FinTechs), ob in seiner Rahmenwerk-"
    "Bibliothek Rahmenwerke FEHLEN.\n\n"
    "Du erhältst 'rahmenwerke' (die vorhandene Bibliothek: id, name, "
    "rechtsakt) und 'meldungen' (neue Behörden-Meldungen, die keinem "
    "Rahmenwerk zugeordnet werden konnten: id, titel, behoerde, datum, "
    "teaser).\n\n"
    "Nenne nur Rahmenwerke (Gesetze, Verordnungen, Richtlinien, "
    "Aufsichtsregelwerke), die (a) eindeutig Kernthema mindestens einer "
    "Meldung sind, (b) in der Bibliothek fehlen — auch nicht unter anderem "
    "Namen enthalten sind — und (c) für die Compliance der Zielgruppe "
    "relevant sind. Einzelfallmaßnahmen, Statistiken, allgemeine Politik "
    "oder Themen ohne eigenes Regelwerk sind KEINE fehlenden Rahmenwerke. "
    "Im Zweifel: nichts melden.\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt der Form "
    '{"fehlend": [{"name": "…", "rechtsakt": "z. B. VO (EU) 2020/1503", '
    '"datum": "Datum bzw. Jahr des Rechtsakts, z. B. 07.10.2020", '
    '"relevanz": "hoch|mittel|niedrig", "begruendung": "1 Satz", '
    '"meldung_ids": [1, 2]}]}. Fehlt nichts: {"fehlend": []}. '
    "Keine Erklärungen."
)


# --------------------------------------------------------------- Persistenz

def ensure_tables(conn: sqlite3.Connection) -> None:
    from .dedup import ensure_tables as dedup_tables
    dedup_tables(conn)
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
    conn.execute(
        """CREATE TABLE IF NOT EXISTS gap_fw_checked (
               document_id INTEGER PRIMARY KEY,
               checked_at  TEXT NOT NULL
           )""")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS gap_fw_reported (
               fw_key      TEXT PRIMARY KEY,  -- normalisierter Name
               name        TEXT NOT NULL,
               reported_at TEXT NOT NULL
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
             AND a.article_id NOT IN
                 (SELECT item_id FROM dedup_suppressed WHERE kind='big4')
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
             AND document_id NOT IN
                 (SELECT item_id FROM dedup_suppressed WHERE kind='document')
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


def _library_frameworks() -> List[dict]:
    """Bestehende Rahmenwerke (id, Name, Rechtsakt) aus web/lib/data.ts;
    Fallback: nur die IDs aus FRAMEWORK_RULES."""
    from .webexport import FRAMEWORK_RULES, WEB_LIVE_PATH
    path = os.path.join(os.path.dirname(WEB_LIVE_PATH), "data.ts")
    entries: List[dict] = []
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        # Framework-Einträge haben kleingeschriebene IDs und stets die
        # Feldfolge id … n:{de:…} … ref:"…" (Provider/Topics: Großbuchstaben).
        for m in re.finditer(
                r'id:"([a-z][a-z0-9]*)"[\s\S]*?n:\{de:"([^"]+)"[\s\S]*?ref:"([^"]+)"',
                text):
            entries.append({"id": m.group(1), "name": m.group(2),
                            "rechtsakt": m.group(3)})
    except OSError:
        pass
    if not entries:
        entries = [{"id": fw_id} for fw_id, _ in FRAMEWORK_RULES]
    return entries


def _framework_gaps(conn: sqlite3.Connection):
    """Neue Meldungen ohne Rahmenwerk-Zuordnung per LLM daraufhin prüfen, ob
    der Bibliothek ein für die Zielgruppe relevantes Rahmenwerk fehlt.

    Rückgabe: (vorschlaege, geprüfte document_ids). Die IDs werden erst nach
    erfolgreichem Versand (bzw. bei leerem Ergebnis sofort) als geprüft
    markiert, damit ein Mail-Fehler keine Vorschläge verschluckt."""
    from .webexport import NOISE, _classify
    rows = conn.execute(
        """SELECT document_id, title, summary, authority, canonical_url,
                  COALESCE(publication_date, substr(first_seen_at, 1, 10)) AS d
           FROM documents
           WHERE source_id NOT IN ('gii', 'rii')
             AND COALESCE(publication_date, substr(first_seen_at, 1, 10)) >= date('now', ?)
             AND document_id NOT IN (SELECT document_id FROM gap_fw_checked)
             AND document_id NOT IN
                 (SELECT item_id FROM dedup_suppressed WHERE kind='document')
           ORDER BY d DESC""",
        ("-{} days".format(PUBLISHED_WINDOW_DAYS),)).fetchall()

    unmatched, checked = [], []
    for r in rows:
        text = "{} {}".format(r["title"] or "", r["summary"] or "")
        if NOISE.search(text) or _classify(text) is not None:
            checked.append(r["document_id"])  # Rauschen bzw. zugeordnet
        else:
            unmatched.append(r)
    if not unmatched:
        return [], checked

    library = _library_frameworks()
    known_keys = {re.sub(r"\W+", "", f.get("name", f["id"]).lower())
                  for f in library}
    already = {r["fw_key"] for r in conn.execute(
        "SELECT fw_key FROM gap_fw_reported")}
    suggestions: List[dict] = []
    for start in range(0, len(unmatched), 40):
        batch = unmatched[start:start + 40]
        by_id = {r["document_id"]: r for r in batch}
        parsed = _chat_json(FW_GAP_PROMPT, {
            "rahmenwerke": library,
            "meldungen": [{"id": r["document_id"],
                           "titel": _clean(r["title"], 200),
                           "behoerde": r["authority"] or "",
                           "datum": (r["d"] or "")[:10],
                           "teaser": _clean(r["summary"], 240)}
                          for r in batch]})
        if parsed is None:
            continue  # Batch beim nächsten Lauf erneut prüfen
        checked.extend(by_id)
        for s in (parsed.get("fehlend") or []):
            if not isinstance(s, dict):
                continue
            name = str(s.get("name") or "").strip()
            key = re.sub(r"\W+", "", name.lower())
            if not key or key in already or key in known_keys:
                continue
            already.add(key)
            docs = [by_id[i] for i in (s.get("meldung_ids") or [])
                    if isinstance(i, int) and i in by_id]
            suggestions.append({
                "key": key,
                "name": name[:120],
                "rechtsakt": str(s.get("rechtsakt") or "")[:120],
                "datum": str(s.get("datum") or "")[:40],
                "relevanz": str(s.get("relevanz") or "")[:10],
                "begruendung": _clean(str(s.get("begruendung") or ""), 300),
                "meldungen": [{"titel": _clean(d["title"], 160),
                               "url": d["canonical_url"] or "",
                               "datum": (d["d"] or "")[:10]} for d in docs],
            })
    return suggestions, checked


def _group_by_topic(gaps: List[sqlite3.Row]) -> List[dict]:
    """Lücken-Artikel per LLM zu Themen aggregieren und je Thema Relevanz,
    Aktualität und ggf. ein fehlendes Rahmenwerk beurteilen; Fallback ohne
    LLM-Antwort: Gruppierung nach Rahmenwerk ohne Einschätzung."""
    parsed = _chat_json(GROUP_PROMPT, {
        "beitraege": [{"id": a["article_id"], "title": _clean(a["title"], 200),
                       "datum": (a["published"] or "")[:10]}
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
                           "relevanz": str(g.get("relevanz") or "")[:10],
                           "aktualitaet": _clean(str(g.get("aktualitaet") or ""), 240),
                           "rahmenwerk": _clean(str(g.get("rahmenwerk") or ""), 160),
                           "artikel": [by_id[i] for i in ids]})
    rest = [a for a in gaps if a["article_id"] not in seen]
    if rest:
        by_fw: Dict[str, List[sqlite3.Row]] = {}
        for a in rest:
            by_fw.setdefault(a["framework"] or "Ohne Rahmenwerk-Zuordnung", []).append(a)
        for fw, items in by_fw.items():
            groups.append({"thema": fw, "relevanz": "", "aktualitaet": "",
                           "rahmenwerk": "", "artikel": items})
    return groups


def _de_date(iso: Optional[str]) -> str:
    if not iso or not re.match(r"\d{4}-\d{2}-\d{2}", iso):
        return ""
    y, m, d = iso[:10].split("-")
    return "{}.{}.{}".format(d, m, y)


def _recommendations(dedup_cases: List[dict], fw_gaps: List[dict],
                     groups: List[dict]) -> Dict[str, dict]:
    """Je Checklisten-Punkt eine LLM-Empfehlung (Entscheidungscode + kurzer
    Grund). Schlüssel: d1…/f1…/s1… nach Position. Ohne LLM-Antwort leer —
    die Mail kommt dann ohne Empfehlungszeilen."""
    items: List[dict] = []
    for i, c in enumerate(dedup_cases, 1):
        items.append({
            "id": "d{}".format(i), "art": "dublette",
            "titel": _clean(c["titel"], 160),
            "eintraege": [{"pos": letter, "quelle": e["quelle"],
                           "datum": e["datum"], "url": e["url"]}
                          for letter, e in zip("abcdef", c["eintraege"])]})
    for i, f in enumerate(fw_gaps, 1):
        items.append({
            "id": "f{}".format(i), "art": "rahmenwerk", "name": f["name"],
            "rechtsakt": f["rechtsakt"], "relevanz": f["relevanz"],
            "begruendung": f["begruendung"]})
    for i, g in enumerate(groups, 1):
        items.append({
            "id": "s{}".format(i), "art": "scraper", "thema": g["thema"],
            "relevanz": g.get("relevanz") or "",
            "aktualitaet": g.get("aktualitaet") or "",
            "beitraege": [_clean(a["title"], 160) for a in g["artikel"]][:6]})
    if not items:
        return {}
    parsed = _chat_json(RECO_PROMPT, {"punkte": items})
    out: Dict[str, dict] = {}
    if parsed and isinstance(parsed.get("empfehlungen"), list):
        for e in parsed["empfehlungen"]:
            if isinstance(e, dict) and e.get("id"):
                out[str(e["id"])] = {
                    "empfehlung": _clean(str(e.get("empfehlung") or ""), 40),
                    "grund": _clean(str(e.get("grund") or ""), 300)}
    return out


def _esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _render_email(groups: List[dict], fw_gaps: List[dict],
                  dedup_cases: Optional[List[dict]] = None,
                  recos: Optional[Dict[str, dict]] = None) -> str:
    """Mail als durchnummerierte Prüf-Checkliste mit LLM-Empfehlung je Punkt.
    Am Ende steht eine Antwortvorlage (Klartext-Block) mit denselben Nummern
    und allen Details (Quellen, URLs, Begründungen, Empfehlung), die der
    Betreiber nach VS Code kopieren und je Punkt mit einer Entscheidung
    beantworten kann — die Entscheidungscodes stehen im Block selbst."""
    dedup_cases = dedup_cases or []
    recos = recos or {}
    nr = 0
    reply: List[str] = []   # Zeilen der Antwortvorlage

    def add_reco(key: str) -> None:
        """Empfehlungszeile in HTML und Antwortvorlage einfügen."""
        r = recos.get(key)
        if not r or not r["empfehlung"]:
            return
        parts.append(
            '<p style="margin:4px 0 0;font-size:13px">'
            '&#9755; Empfehlung: <strong>{}</strong>{}</p>'.format(
                r["empfehlung"],
                " — {}".format(r["grund"]) if r["grund"] else ""))
        reply.append("    Empfehlung: {}{}".format(
            r["empfehlung"],
            " — {}".format(r["grund"]) if r["grund"] else ""))

    parts = [
        '<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">',
        '<p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>',
    ]
    total = len(dedup_cases) + len(fw_gaps) + len(groups)
    summary = []
    if dedup_cases:
        summary.append("{} unsichere Dublette(n)".format(len(dedup_cases)))
    if fw_gaps:
        summary.append("{} Rahmenwerk-Vorschläge".format(len(fw_gaps)))
    if groups:
        summary.append("{} Scraper-Kandidat(en)".format(len(groups)))
    parts.append(
        '<p style="margin:16px 0"><strong>Checkliste: {} Punkte</strong> — {}. '
        "Punkte der Reihe nach prüfen; die <strong>Antwortvorlage am Ende</strong> "
        "nach VS Code kopieren und je Punkt die Entscheidung eintragen.</p>".format(
            total, ", ".join(summary)))

    if dedup_cases:
        parts.append(
            '<p style="margin:20px 0 6px;font-size:16px;font-weight:700">'
            "Mögliche Dubletten — Eingriff nötig?</p>"
            "<p>Gleicher Titel mit größerem zeitlichem Abstand: kann eine "
            "Neuveröffentlichung <em>oder</em> ein eigenständiges Dokument sein. "
            "Eindeutige Dubletten (Schwere: <strong>sicher</strong>) werden "
            "automatisch unterdrückt und nicht angefragt; die folgenden Fälle "
            "sind <strong>unsicher</strong> — ohne Rückmeldung bleiben beide "
            "Einträge bestehen:</p>")
        for i, c in enumerate(dedup_cases, 1):
            nr += 1
            kind_label = "Big4-Artikel" if c["kind"] == "big4" else "Meldung"
            parts.append(
                '<p style="margin:14px 0 2px"><strong>[{}] {}</strong> '
                '<span style="color:#64748b;font-size:13px">({})</span></p>'.format(
                    nr, _clean(c["titel"], 160), kind_label))
            parts.append('<ul style="margin:0;padding-left:20px">')
            reply.append("[{}] DUBLETTE ({}): {}".format(
                nr, kind_label, _clean(c["titel"], 160)))
            for letter, e in zip("abcdef", c["eintraege"]):
                parts.append(
                    '<li style="margin:2px 0">{letter}) {quelle}, {datum}: '
                    '<a href="{url}" style="color:#0f172a">{url}</a></li>'.format(
                        letter=letter, quelle=e["quelle"],
                        datum=_de_date(e["datum"]) or e["datum"], url=e["url"]))
                reply.append("    {}) {} {} — id {}".format(
                    letter, e["quelle"], _de_date(e["datum"]) or e["datum"],
                    e.get("id", "?")))
                reply.append("       {}".format(e["url"]))
            parts.append("</ul>")
            add_reco("d{}".format(i))
            reply.append("    Entscheidung [eigenstaendig | dublette-behalte-a | "
                         "dublette-behalte-b]: ")
            reply.append("    Kommentar: ")
            reply.append("")

    if fw_gaps:
        parts.append(
            '<p style="margin:20px 0 6px;font-size:16px;font-weight:700">'
            "Möglicherweise fehlende Rahmenwerke</p>"
            "<p>Neue Meldungen, die keinem Rahmenwerk der Bibliothek zugeordnet "
            "werden konnten, deuten auf folgende Lücken:</p>")
        for i, f in enumerate(fw_gaps, 1):
            nr += 1
            meta = " ".join(x for x in (f["rechtsakt"], "vom {}".format(f["datum"])
                                        if f["datum"] else "") if x)
            parts.append(
                '<p style="margin:16px 0 4px"><strong>[{nr}] {name}</strong>{meta}'
                '{rel}</p>'.format(
                    nr=nr, name=f["name"],
                    meta=" ({})".format(meta) if meta else "",
                    rel=' — Relevanz: <strong>{}</strong>'.format(f["relevanz"])
                        if f["relevanz"] else ""))
            if f["begruendung"]:
                parts.append('<p style="margin:0 0 4px;color:#334155">{}</p>'.format(
                    f["begruendung"]))
            if f["meldungen"]:
                parts.append('<ul style="margin:0;padding-left:20px">')
                for m in f["meldungen"]:
                    parts.append(
                        '<li style="margin:4px 0">{date}<a href="{url}" '
                        'style="color:#0f172a">{title}</a></li>'.format(
                            date="{}: ".format(_de_date(m["datum"])) if _de_date(m["datum"]) else "",
                            url=m["url"], title=m["titel"]))
                parts.append("</ul>")
            reply.append("[{}] RAHMENWERK: {}{}{}".format(
                nr, f["name"], " ({})".format(meta) if meta else "",
                " — Relevanz: {}".format(f["relevanz"]) if f["relevanz"] else ""))
            if f["begruendung"]:
                reply.append("    Begründung: {}".format(f["begruendung"]))
            for m in f["meldungen"]:
                reply.append("    - {}{}".format(
                    "{}: ".format(_de_date(m["datum"])) if _de_date(m["datum"]) else "",
                    m["titel"]))
                reply.append("      {}".format(m["url"]))
            add_reco("f{}".format(i))
            reply.append("    Entscheidung [aufnehmen | ignorieren]: ")
            reply.append("    Kommentar: ")
            reply.append("")

    if groups:
        parts.append(
            '<p style="margin:24px 0 6px;font-size:16px;font-weight:700">'
            "Big-4-/Kanzlei-Beiträge ohne Primärquelle</p>"
            "<p>Beiträge zu Themen, zu denen <strong>keine gescrapte "
            "Primärquelle</strong> vorliegt — Kandidaten für einen neuen Scraper:</p>")
    for i, g in enumerate(groups, 1):
        nr += 1
        parts.append(
            '<p style="margin:20px 0 2px;font-weight:600">[{}] {}</p>'.format(
                nr, g["thema"]))
        assess = []
        if g.get("relevanz"):
            assess.append("Relevanz: <strong>{}</strong>".format(g["relevanz"]))
        if g.get("aktualitaet"):
            assess.append(g["aktualitaet"])
        if g.get("rahmenwerk"):
            assess.append("mögliches fehlendes Rahmenwerk: {}".format(g["rahmenwerk"]))
        if assess:
            parts.append(
                '<p style="margin:0 0 6px;color:#334155;font-size:13px">{}</p>'.format(
                    " · ".join(assess)))
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
        reply.append("[{}] SCRAPER-KANDIDAT: {}{}".format(
            nr, g["thema"],
            " — Relevanz: {}".format(g["relevanz"]) if g.get("relevanz") else ""))
        if g.get("aktualitaet"):
            reply.append("    Aktualität: {}".format(g["aktualitaet"]))
        if g.get("rahmenwerk"):
            reply.append("    mögliches fehlendes Rahmenwerk: {}".format(
                g["rahmenwerk"]))
        for a in g["artikel"]:
            date = _de_date(a["published"])
            reply.append("    - {}{}: {}".format(
                a["firm"], ", {}".format(date) if date else "",
                _clean(a["title"], 160)))
            reply.append("      {}".format(a["url"]))
        add_reco("s{}".format(i))
        reply.append("    Entscheidung [neue-quelle | abgedeckt | ignorieren]: ")
        reply.append("    Kommentar: ")
        reply.append("")

    if reply:
        template = "\n".join(
            ["=== RADAR-CHECKLISTE {} — ANTWORTVORLAGE ===".format(utcnow()[:10]),
             "Die Empfehlung je Punkt ist ein LLM-Vorschlag — die Entscheidung",
             "liegt bei dir (Empfehlung übernehmen oder überstimmen).",
             "Entscheidungscodes:",
             "  Dublette:  eigenstaendig (beide behalten) | "
             "dublette-behalte-a | dublette-behalte-b",
             "  Rahmenwerk: aufnehmen | ignorieren",
             "  Scraper:   neue-quelle | abgedeckt | ignorieren",
             ""] + reply)
        parts.append(
            '<p style="margin:24px 0 6px;font-size:16px;font-weight:700">'
            "Antwortvorlage</p>"
            "<p>Block kopieren, in VS Code je Punkt die Entscheidung eintragen "
            "und zurückschicken bzw. Claude Code übergeben:</p>")
        parts.append(
            '<pre style="background:#f1f5f9;padding:16px;border-radius:8px;'
            'font-size:12px;line-height:1.5;white-space:pre-wrap;'
            'font-family:ui-monospace,Menlo,monospace">{}</pre>'.format(
                _esc(template)))

    parts.append(
        '<p style="color:#64748b;font-size:13px;margin-top:24px">Streng geprüft '
        "gegen die gescrapten Dokumente der letzten {} Tage; jeder Beitrag und "
        "jedes Rahmenwerk wird nur einmal gemeldet. Max. eine Mail pro Tag.</p>".format(
            DOC_WINDOW_DAYS))
    parts.append("</div>")
    return "".join(parts)


def _mark_fw_checked(conn: sqlite3.Connection, doc_ids: List[int]) -> None:
    now = utcnow()
    for doc_id in doc_ids:
        conn.execute("INSERT OR REPLACE INTO gap_fw_checked VALUES (?,?)",
                     (doc_id, now))


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
    articles = _relevant_only(conn, candidates) if candidates else []
    gaps: List[sqlite3.Row] = []
    if articles:
        docs = _recent_documents(conn)
        covered = _coverage(articles, docs)
        gaps = [a for a in articles if covered.get(a["article_id"]) is False]

    fw_gaps, fw_checked = _framework_gaps(conn)

    # Dubletten: sichere Fälle sofort unterdrücken (läuft zusätzlich stündlich
    # via `dedup`-Befehl); unsichere Fälle wandern in die Tages-Mail.
    from .dedup import mark_reported, run as dedup_run
    dedup_info = dedup_run(conn)
    dedup_cases = dedup_info["manual"]

    if not gaps and not fw_gaps and not dedup_cases:
        _mark_fw_checked(conn, fw_checked)
        conn.execute("INSERT OR REPLACE INTO big4_gap_runs VALUES (?,0,0)", (today,))
        conn.commit()
        return {"status": "keine Lücken ({} Artikel geprüft, Rahmenwerk- und "
                          "Dubletten-Check ohne Befund)".format(len(candidates)),
                "gaps": 0}

    groups = _group_by_topic(gaps) if gaps else []
    bits = []
    if gaps:
        bits.append("{} Beitrag/Beiträge ohne Primärquelle ({} Themen)".format(
            len(gaps), len(groups)))
    if fw_gaps:
        bits.append("{} mögliche(s) fehlende(s) Rahmenwerk(e)".format(len(fw_gaps)))
    if dedup_cases:
        bits.append("{} unsichere Dublette(n)".format(len(dedup_cases)))
    subject = "Radar-Lücke: " + ", ".join(bits)
    recos = _recommendations(dedup_cases, fw_gaps, groups)
    err = _send_email(subject, _render_email(groups, fw_gaps, dedup_cases, recos))
    if err:
        # Nichts als gemeldet markieren — nächster Lauf versucht es erneut.
        return {"status": "Mail fehlgeschlagen: {}".format(err), "gaps": len(gaps)}

    now = utcnow()
    for a in gaps:
        conn.execute("INSERT OR REPLACE INTO big4_gap_reported VALUES (?,?)",
                     (a["article_id"], now))
    for f in fw_gaps:
        conn.execute("INSERT OR REPLACE INTO gap_fw_reported VALUES (?,?,?)",
                     (f["key"], f["name"], now))
    mark_reported(conn, dedup_cases)
    _mark_fw_checked(conn, fw_checked)
    conn.execute("INSERT OR REPLACE INTO big4_gap_runs VALUES (?,1,?)",
                 (today, len(gaps)))
    conn.commit()
    return {"status": "Mail verschickt ({} Rahmenwerk-Vorschläge, {} unsichere "
                      "Dubletten)".format(len(fw_gaps), len(dedup_cases)),
            "gaps": len(gaps), "themen": len(groups), "geprüft": len(candidates)}
