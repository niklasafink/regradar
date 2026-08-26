"""LLM-Kurzzusammenfassungen für den Web-Export.

Erzeugt pro exportiertem Update 2–3 verständliche deutsche Sätze
("Was ändert sich, für wen, bis wann?") plus englische Fassung –
statt des rohen Behörden-Teasers in Originalsprache. Ergebnisse werden
pro Dokument in der SQLite-DB gecacht.

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
BATCH_SIZE = 4
TIMEOUT = 120

SYSTEM_PROMPT = (
    "Du schreibst Kurzzusammenfassungen für einen Regulatory-News-Dienst, den "
    "Compliance-Verantwortliche von Finanzunternehmen lesen.\n\n"
    "Du erhältst eine JSON-Liste von Meldungen (id, text). Der Text enthält "
    "Titel, Dokumenttyp, Behörde, Datum und ggf. den Original-Teaser sowie "
    "Fristen.\n\n"
    "Schreibe je Meldung eine Zusammenfassung in 2–3 kurzen, klaren deutschen "
    "Sätzen, die drei Fragen beantwortet, soweit der Text es hergibt: Was "
    "ändert sich? Für wen gilt es? Bis wann (Konsultationsfrist oder "
    "Anwendungsbeginn)? Dazu eine englische Fassung gleichen Inhalts.\n\n"
    "Regeln: Nur Informationen aus dem gegebenen Text verwenden, nichts "
    "erfinden und keine Fristen raten. Fachbegriffe und Normbezeichnungen "
    "(z. B. RTS, MiCAR, § 25a KWG) beibehalten. Nüchtern und ohne Floskeln, "
    "kein 'Diese Meldung …'-Einstieg. Datumsformat TT.MM.JJJJ im Deutschen.\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt, das jede id auf ein "
    'Objekt {"de": "...", "en": "..."} abbildet. Keine Erklärungen.'
)


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_summary (
               document_id INTEGER PRIMARY KEY REFERENCES documents(document_id),
               de          TEXT NOT NULL,
               en          TEXT NOT NULL,
               model       TEXT NOT NULL,
               created_at  TEXT NOT NULL
           )""")
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
            "SELECT document_id, de, en FROM llm_summary WHERE document_id IN ({})".format(
                ",".join("?" * len(items))),
            [i for i, _ in items]).fetchall()
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
                "INSERT OR REPLACE INTO llm_summary VALUES (?,?,?,?,?)",
                (i, s["de"], s["en"], model, utcnow()))
        conn.commit()
    return result
