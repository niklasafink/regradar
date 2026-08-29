"""LLM-Zusammenfassungen für den Web-Export.

Erzeugt pro exportiertem Update eine verständliche deutsche Zusammenfassung
in bis zu drei kurzen Absätzen ("Was regelt das Dokument, für wen ist es
relevant, welche Fristen gelten?") plus englische Fassung – statt des rohen
Behörden-Teasers in Originalsprache. Titel passender Big-4-/Kanzlei-Beiträge
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
BATCH_SIZE = 2
TIMEOUT = 120

# Format-Version der Zusammenfassungen. Bei Prompt-Änderungen, die alte
# Cache-Einträge unbrauchbar machen, hochzählen – der nächste Export
# generiert dann alle Zusammenfassungen neu.
FORMAT = 2

SYSTEM_PROMPT = (
    "Du schreibst Zusammenfassungen für einen Regulatory-News-Dienst, den "
    "Compliance-Verantwortliche von Finanzunternehmen lesen.\n\n"
    "Du erhältst eine JSON-Liste von Meldungen (id, text). Der Text enthält "
    "Titel, Dokumenttyp, Behörde, Datum und ggf. den Original-Teaser, Fristen "
    "sowie Titel von Fachbeiträgen von Beratungsgesellschaften/Kanzleien zu "
    "dieser Meldung.\n\n"
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
    "Regeln: Nur Informationen aus dem gegebenen Text verwenden, nichts "
    "erfinden und keine Fristen raten. Gibt der Text wenig her, schreibe "
    "lieber weniger Absätze als vage Füllsätze. Fachbegriffe und "
    "Normbezeichnungen (z. B. RTS, MiCAR, § 25a KWG) beibehalten. Nüchtern "
    "und ohne Floskeln, kein 'Diese Meldung …'-Einstieg. Datumsformat "
    "TT.MM.JJJJ im Deutschen.\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt, das jede id auf ein "
    'Objekt {"de": "...", "en": "..."} abbildet (Absätze durch \\n\\n '
    "getrennt). Keine Erklärungen."
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
    conn.commit()


def _chat(model: str, key: str, items: List[Tuple[int, str]]) -> Dict[int, Dict[str, str]]:
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
    out: Dict[int, Dict[str, str]] = {}
    for i, _ in items:
        v = parsed.get(str(i), parsed.get(i))
        if (isinstance(v, dict) and isinstance(v.get("de"), str)
                and isinstance(v.get("en"), str) and v["de"].strip()):
            out[i] = {"de": v["de"].strip(), "en": v["en"].strip()}
    return out


def summarize(conn: sqlite3.Connection,
              items: List[Tuple[int, str]]) -> Dict[int, Dict[str, str]]:
    """items: Liste (document_id, Kontexttext).

    Rückgabe: document_id -> {"de": ..., "en": ...}. Ohne API-Key oder bei
    API-Fehlern fehlen die betroffenen ids; der Aufrufer nutzt dann den
    Original-Teaser als Fallback.
    """
    _ensure_table(conn)
    result: Dict[int, Dict[str, str]] = {}
    if items:
        cached = conn.execute(
            "SELECT document_id, de, en FROM llm_summary "
            "WHERE fmt=? AND document_id IN ({})".format(
                ",".join("?" * len(items))),
            [FORMAT] + [i for i, _ in items]).fetchall()
        for row in cached:
            result[row[0]] = {"de": row[1], "en": row[2]}

    todo = [(i, t) for i, t in items if i not in result]
    key = api_key()
    if not key or not todo:
        return result

    model = os.environ.get("OPENROUTER_SUMMARY_MODEL", DEFAULT_MODEL)
    from .db import utcnow
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start:start + BATCH_SIZE]
        got = {}
        for attempt in (1, 2):
            try:
                got = _chat(model, key, batch)
                break
            except (urllib.error.URLError, json.JSONDecodeError, KeyError, TimeoutError) as e:
                print("LLM-Zusammenfassung: Versuch {} fehlgeschlagen ({}: {})".format(
                    attempt, type(e).__name__, e))
        for i, s in got.items():
            result[i] = s
            conn.execute(
                "INSERT OR REPLACE INTO llm_summary VALUES (?,?,?,?,?,?)",
                (i, s["de"], s["en"], model, utcnow(), FORMAT))
        conn.commit()
    return result
