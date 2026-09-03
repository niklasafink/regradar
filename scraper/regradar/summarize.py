"""LLM-Zusammenfassungen für den Web-Export.

Erzeugt pro exportiertem Update eine verständliche deutsche Zusammenfassung
in bis zu drei kurzen Absätzen ("Was regelt das Dokument, für wen ist es
relevant, welche Fristen gelten?") plus englische Fassung – statt des rohen
Behörden-Teasers in Originalsprache. Grundlage ist der abgerufene Volltext
der Original-Meldung (fulltext.py); Titel passender Big-4-/Kanzlei-Beiträge
fließen als Kontext mit ein. Ergebnisse werden pro Dokument in der
SQLite-DB gecacht (versioniert über FORMAT).

Ohne OPENROUTER_API_KEY ist das Modul inaktiv; der Export fällt dann auf
die bereinigten Original-Teaser zurück.
"""
import json
import re
import os
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

from .llmfilter import API_URL, api_key

DEFAULT_MODEL = "google/gemini-2.5-flash"
# Einzeln statt gebatcht: mit langen Volltext-Auszügen im Kontext lässt das
# Modell bei Mehrfach-Batches sonst gelegentlich stillschweigend ids weg.
BATCH_SIZE = 1
TIMEOUT = 120

# Format-Version der Zusammenfassungen. Bei Prompt-Änderungen, die alte
# Cache-Einträge unbrauchbar machen, hochzählen – der nächste Export
# generiert dann alle Zusammenfassungen neu.
FORMAT = 4
# Verlegenheitsantworten des Modells ("Der Text enthält keine Informationen …")
# sind keine Zusammenfassung: nicht cachen, Aufrufer nutzt den Original-Teaser.
UNUSABLE = re.compile(
    r"^\s*(der (text|inhalt|artikel)|die (meldung|quelle|seite)|es) "
    r"(enthält|liefert|bietet|liegt|ist|handelt)[^.]{0,80}"
    r"(keine (informationen|angaben|inhalte)|lediglich|nicht verfügbar|nicht vor)",
    re.IGNORECASE)


def usable(summary: Optional[str]) -> bool:
    return bool(summary) and not UNUSABLE.search(summary)


# Erkennung nicht-deutscher Titel für die Nachübersetzung bereits gecachter
# Zusammenfassungen (FORMAT 4 lieferte "ti" nur bei kryptischen Titeln).
_EN_WORDS = {"the", "of", "on", "for", "and", "to", "with", "under", "by",
             "in", "from", "at", "new", "its", "into", "as", "regarding"}
_DE_WORDS = {"der", "die", "das", "und", "zur", "zum", "für", "von", "des",
             "im", "bei", "mit", "nach", "über", "zu", "den", "dem", "eine",
             "einer", "ein", "am", "vom", "durch", "an", "aus", "gegen"}
_EN_HINTS = re.compile(
    r"\b(circular|letter|regulation|law|guidance|consultation|report|statement|"
    r"update|updated|notice|decision|opinion|final|draft|press|release|"
    r"guidelines|survey|framework|standards?|review|publication|"
    r"communication|notification|launch(es|ed)?)\b", re.IGNORECASE)


def looks_english(title: Optional[str]) -> bool:
    """True, wenn ein Titel nicht deutsch ist (englische Funktionswörter
    überwiegen, oder ohne Funktionswörter englische Signalwörter ohne
    Umlaute)."""
    if not title:
        return False
    words = re.findall(r"[a-zäöüß]+", title.lower())
    en = sum(w in _EN_WORDS for w in words)
    de = sum(w in _DE_WORDS for w in words)
    if en or de:
        return en > de
    return bool(_EN_HINTS.search(title)) and not re.search(r"[äöüß]", title.lower())


TITLE_PROMPT = (
    "Du erhältst eine JSON-Liste (id, title) mit Titeln regulatorischer "
    "Meldungen für Compliance-Verantwortliche von Finanzunternehmen. Liefere "
    "je id einen deutschen Anzeigetitel: sinngemäß und fachlich korrekt "
    "übersetzt, kurz (max. ca. 90 Zeichen). Etablierte englische Eigenbegriffe "
    "und Namen von Rechtsakten bleiben unübersetzt (z. B. DORA, MiCA, "
    "Solvency II, Consolidated Tape, Q&A, RTS/ITS, Level 1, Have Your Say); "
    "offizielle Kennungen und Nummern bleiben in Klammern am Ende erhalten. "
    'Antworte ausschließlich mit einem JSON-Objekt {id: {"de": "...", '
    '"en": "<Originaltitel, ggf. gekürzt>"}}. Keine Erklärungen.'
)
TITLE_BATCH = 15


def _translate_titles(model: str, key: str,
                      items: List[Tuple[int, str]]) -> Dict[int, dict]:
    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": TITLE_PROMPT},
            {"role": "user", "content": json.dumps(
                [{"id": i, "title": t} for i, t in items], ensure_ascii=False)},
        ],
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer {}".format(key),
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    parsed = json.loads(content)
    out: Dict[int, dict] = {}
    for i, t in items:
        v = parsed.get(str(i), parsed.get(i)) if isinstance(parsed, dict) else None
        if isinstance(v, dict) and isinstance(v.get("de"), str) and v["de"].strip():
            out[i] = {"de": v["de"].strip()[:160],
                      "en": (v.get("en") or t).strip()[:160]}
    return out


def _title_from_context(context: str) -> str:
    m = re.match(r"Titel: (.*)", context)
    return m.group(1).strip() if m else ""


def backfill_titles(conn: sqlite3.Connection, model: str, key: str,
                    items: List[Tuple[int, str]]) -> Dict[int, dict]:
    """Deutsche Anzeigetitel für gecachte Zusammenfassungen ohne "ti", deren
    Original-Titel nicht deutsch ist. items: (document_id, Original-Titel).
    Ergebnis wird in llm_summary (ti_de/ti_en) gespeichert."""
    from .db import utcnow
    result: Dict[int, dict] = {}
    todo = [(i, t) for i, t in items if looks_english(t)]
    for start in range(0, len(todo), TITLE_BATCH):
        batch = todo[start:start + TITLE_BATCH]
        try:
            got = _translate_titles(model, key, batch)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                ValueError, TimeoutError) as e:
            print("LLM-Titel: Batch fehlgeschlagen ({}: {})".format(type(e).__name__, e))
            continue
        for i, ti in got.items():
            conn.execute("UPDATE llm_summary SET ti_de=?, ti_en=? WHERE document_id=?",
                         (ti["de"], ti["en"], i))
            result[i] = ti
        conn.commit()
    if todo:
        print("LLM-Titel: {} von {} englischen Titeln übersetzt".format(len(result), len(todo)))
    return result

SYSTEM_PROMPT = (
    "Du schreibst Zusammenfassungen für einen Regulatory-News-Dienst, den "
    "Compliance-Verantwortliche von Finanzunternehmen lesen.\n\n"
    "Du erhältst eine JSON-Liste von Meldungen (id, text). Der Text enthält "
    "Titel, Dokumenttyp, Behörde, Datum und ggf. den Original-Teaser, Fristen, "
    "Titel von Fachbeiträgen von Beratungsgesellschaften/Kanzleien zu dieser "
    "Meldung sowie einen Auszug aus dem Volltext der Original-Meldung. Stütze "
    "die Zusammenfassung primär auf diesen Volltext-Auszug – er ist die "
    "Primärquelle; Titel und Teaser dienen nur der Einordnung. Der Auszug "
    "kann Reste von Seitennavigation enthalten, ignoriere diese.\n\n"
    "Schreibe je Meldung eine Zusammenfassung in 2–3 kurzen deutschen "
    "Absätzen (jeweils 2–4 Sätze, getrennt durch eine Leerzeile), sodass "
    "Leser den Inhalt der Neuerung verstehen und einschätzen können, ob sie "
    "für sie relevant ist:\n"
    "1. Inhalt: Was regelt oder ändert das Dokument konkret? Worum geht es "
    "inhaltlich?\n"
    "2. Relevanz: Für welche Unternehmen/Institute gilt es und was bedeutet "
    "es praktisch für sie? Greifen Fachbeiträge bestimmte Aspekte auf, "
    "kannst du deren Schwerpunkte als Hinweis auf die Praxisrelevanz "
    "einfließen lassen.\n"
    "3. Fristen/nächste Schritte: Konsultationsfrist, Anwendungsbeginn oder "
    "weiteres Verfahren – nur soweit der Text es hergibt; sonst diesen "
    "Absatz weglassen.\n\n"
    "Dazu eine englische Fassung gleichen Inhalts und Aufbaus.\n\n"
    "Titel: Liefere zusätzlich einen Anzeigetitel als "
    '"ti": {"de": "...", "en": "..."}, wenn der Original-Titel (a) nicht auf '
    "Deutsch ist oder (b) für Leser ohne Detailwissen unverständlich ist – "
    "etwa nur ein technischer Code, eine Regel-/Vorlagen-ID, ein Aktenzeichen "
    "oder ein Dateiname (wie 'Validation Rule RRCOROF_V903610_H_C0030') oder "
    "ein nichtssagender Titel wie 'Circular letter'. "
    '"de" ist ein deutscher Titel: sinngemäß und fachlich korrekt übersetzt '
    "bzw. beschreibend, kurz (max. ca. 90 Zeichen), sagt worum es inhaltlich "
    "geht. Etablierte englische Eigenbegriffe und Namen von Rechtsakten "
    "bleiben unübersetzt (z. B. DORA, MiCA, Solvency II, Consolidated Tape, "
    "Q&A, RTS/ITS, Level 1, Reply Form, Have Your Say); offizielle Kennungen "
    "und Nummern (Rundschreiben-Nr., Q&A-ID, Aktenzeichen) bleiben in Klammern "
    'am Ende erhalten. "en" ist der englische Titel (bei englischem Original '
    "der Originaltitel, ggf. gekürzt; bei deutschem Original eine "
    "Übersetzung). Ist der Original-Titel bereits deutsch und verständlich, "
    'lasse "ti" weg.\n\n'
    "Regeln: Nur Informationen aus dem gegebenen Text verwenden, nichts "
    "erfinden und keine Fristen raten. Gibt der Text wenig her, schreibe "
    "lieber weniger Absätze als vage Füllsätze. Fachbegriffe und "
    "Normbezeichnungen (z. B. RTS, MiCAR, § 25a KWG) beibehalten. Nüchtern "
    "und ohne Floskeln, kein 'Diese Meldung …'-Einstieg. Datumsformat "
    "TT.MM.JJJJ im Deutschen.\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt, das jede id auf ein "
    'Objekt {"de": "...", "en": "...", "ti": {…} nur falls nötig} abbildet '
    "(Absätze durch \\n\\n getrennt). Keine Erklärungen."
)


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_summary (
               document_id INTEGER PRIMARY KEY REFERENCES documents(document_id),
               de          TEXT NOT NULL,
               en          TEXT NOT NULL,
               model       TEXT NOT NULL,
               created_at  TEXT NOT NULL,
               fmt         INTEGER NOT NULL DEFAULT 1
           )""")
    cols = [r[1] for r in conn.execute("PRAGMA table_info(llm_summary)")]
    if "fmt" not in cols:
        conn.execute(
            "ALTER TABLE llm_summary ADD COLUMN fmt INTEGER NOT NULL DEFAULT 1")
    # Optionaler LLM-Anzeigetitel für kryptische Original-Titel (fmt >= 4).
    if "ti_de" not in cols:
        conn.execute("ALTER TABLE llm_summary ADD COLUMN ti_de TEXT")
        conn.execute("ALTER TABLE llm_summary ADD COLUMN ti_en TEXT")
    conn.commit()


def _chat(model: str, key: str, items: List[Tuple[int, str]]) -> Dict[int, dict]:
    payload = {
        "model": model,
        "temperature": 0.2,
        # Großzügiges Limit, damit JSON-Antworten nicht abgeschnitten werden.
        "max_tokens": 8000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(
                [{"id": i, "text": t} for i, t in items], ensure_ascii=False)},
        ],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer {}".format(key),
            "Content-Type": "application/json",
        })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    parsed = json.loads(content)
    # Manche Modelle liefern trotz Vorgabe eine Liste statt des id-Objekts –
    # mit id-Feld je Eintrag oder (bei einzelnen Meldungen) ganz ohne ids.
    # In die Objektform normalisieren, notfalls positional zuordnen.
    if isinstance(parsed, list):
        entries = [e for e in parsed if isinstance(e, dict)]
        if all(e.get("id") is not None for e in entries):
            parsed = {str(e["id"]): e for e in entries}
        elif len(entries) == len(items):
            parsed = {str(i): e for (i, _), e in zip(items, entries)}
        else:
            raise ValueError("LLM-Liste ohne ids ({} Einträge für {} Meldungen)".format(
                len(entries), len(items)))
    if not isinstance(parsed, dict):
        raise ValueError("unerwartete LLM-Antwortform: {}".format(type(parsed).__name__))
    # Einzelanfrage, deren Antwort direkt {"de": …, "en": …} ist (ohne id-Ebene).
    if len(items) == 1 and "de" in parsed and "en" in parsed:
        parsed = {str(items[0][0]): parsed}
    out: Dict[int, dict] = {}
    for i, _ in items:
        v = parsed.get(str(i), parsed.get(i))
        if (isinstance(v, dict) and isinstance(v.get("de"), str)
                and isinstance(v.get("en"), str) and v["de"].strip()):
            entry = {"de": v["de"].strip(), "en": v["en"].strip()}
            # Optionaler Anzeigetitel, nur bei kryptischen Original-Titeln.
            ti = v.get("ti")
            if (isinstance(ti, dict) and isinstance(ti.get("de"), str)
                    and isinstance(ti.get("en"), str) and ti["de"].strip()
                    and ti["en"].strip()):
                entry["ti"] = {"de": ti["de"].strip(), "en": ti["en"].strip()}
            out[i] = entry
        else:
            print("LLM-Zusammenfassung: id {} verworfen (Antwort: {} …, Schlüssel: {})".format(
                i, json.dumps(v, ensure_ascii=False)[:200], list(parsed)[:5]))
    return out


def summarize(conn: sqlite3.Connection,
              items: List[Tuple[int, str, Optional[str]]]) -> Dict[int, dict]:
    """items: Liste (document_id, Kontexttext, canonical_url).

    Für noch nicht gecachte Dokumente wird der Volltext der Original-Meldung
    abgerufen (fulltext.py, gecacht) und an den Kontext angehängt, damit die
    Zusammenfassung auf der Primärquelle basiert statt nur auf dem Teaser.

    Rückgabe: document_id -> {"de": ..., "en": ..., optional "ti": {de, en}}
    ("ti" = beschreibender Anzeigetitel, nur wenn der Original-Titel kryptisch
    ist). Ohne API-Key oder bei API-Fehlern fehlen die betroffenen ids; der
    Aufrufer nutzt dann Original-Teaser bzw. -Titel als Fallback.
    """
    _ensure_table(conn)
    result: Dict[int, dict] = {}
    if items:
        cached = conn.execute(
            "SELECT document_id, de, en, ti_de, ti_en FROM llm_summary "
            "WHERE fmt=? AND document_id IN ({})".format(
                ",".join("?" * len(items))),
            [FORMAT] + [i for i, _, _ in items]).fetchall()
        for row in cached:
            entry = {"de": row[1], "en": row[2]}
            if row[3] and row[4]:
                entry["ti"] = {"de": row[3], "en": row[4]}
            result[row[0]] = entry

    key = api_key()
    if not key:
        return result

    model = os.environ.get("OPENROUTER_SUMMARY_MODEL", DEFAULT_MODEL)
    # Gecachte Einträge ohne Anzeigetitel, deren Original nicht deutsch ist:
    # Titel nachübersetzen (FORMAT 4 lieferte "ti" nur bei kryptischen Titeln).
    need_title = [(i, _title_from_context(t)) for i, t, _ in items
                  if i in result and "ti" not in result[i]]
    for i, ti in backfill_titles(conn, model, key, need_title).items():
        result[i]["ti"] = ti

    from .fulltext import fetch_fulltext
    todo = []
    for i, t, url in items:
        if i in result:
            continue
        full = fetch_fulltext(conn, i, url)
        if full:
            t = "{}\nVolltext der Original-Meldung (Auszug):\n{}".format(t, full)
        todo.append((i, t))
    if not todo:
        return result

    from .db import utcnow
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start:start + BATCH_SIZE]
        got = {}
        for attempt in (1, 2):
            try:
                got = _chat(model, key, batch)
                if len(got) == len(batch):
                    break
                # Antwort ohne die angefragte id (Modell-Laune) → neu versuchen.
                print("LLM-Zusammenfassung: Versuch {} unvollständig "
                      "({}/{} ids)".format(attempt, len(got), len(batch)))
            except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                    ValueError, TimeoutError) as e:
                print("LLM-Zusammenfassung: Versuch {} fehlgeschlagen ({}: {})".format(
                    attempt, type(e).__name__, e))
        for i, s in got.items():
            if not usable(s.get("de")):
                print("LLM-Zusammenfassung: unbrauchbare Antwort für id {} verworfen".format(i))
                continue
            result[i] = s
            ti = s.get("ti") or {}
            conn.execute(
                "INSERT OR REPLACE INTO llm_summary "
                "(document_id, de, en, model, created_at, fmt, ti_de, ti_en) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (i, s["de"], s["en"], model, utcnow(), FORMAT,
                 ti.get("de"), ti.get("en")))
        conn.commit()
    return result
