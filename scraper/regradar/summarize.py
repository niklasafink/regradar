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
    "Titel: Ist der Original-Titel der Meldung für Leser ohne Detailwissen "
    "unverständlich – z. B. nur ein technischer Code, eine Regel-/Vorlagen-ID, "
    "ein Aktenzeichen oder ein Dateiname (etwa 'Validation Rule "
    "RRCOROF_V903610_H_C0030') – liefere zusätzlich einen beschreibenden "
    'Anzeigetitel als "ti": {"de": "...", "en": "..."}: kurz (max. ca. 90 '
    "Zeichen), sagt worum es inhaltlich geht, nutzt offizielle Fachbegriffe "
    "(z. B. COREP, Meldewesen, RTS) und behält die offizielle Kennung in "
    "Klammern am Ende, damit die Meldung auffindbar bleibt. Ist der "
    'Original-Titel bereits verständlich, lasse "ti" weg – verständliche '
    "Titel bleiben unverändert in Originalsprache.\n\n"
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

    model = os.environ.get("OPENROUTER_SUMMARY_MODEL", DEFAULT_MODEL)
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
