"""LLM-Relevanzfilter für den Web-Export.

Stuft Meldungen per günstigem LLM (über OpenRouter) als regulatorisch
relevant oder irrelevant ein. Ergebnisse werden pro Dokument in der
SQLite-DB gecacht, sodass jedes Dokument nur einmal klassifiziert wird.

Ohne gesetzten OPENROUTER_API_KEY ist der Filter inaktiv (alle Kandidaten
gelten als relevant); der Regex-NOISE-Vorfilter in webexport.py greift
unabhängig davon immer.
"""
import json
import os
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-2.5-flash-lite"
BATCH_SIZE = 25
TIMEOUT = 90

SYSTEM_PROMPT = (
    "Du filterst einen Regulatory-News-Feed für Compliance-Abteilungen von "
    "Finanzunternehmen (Banken, Asset Manager, Wertpapier- und Zahlungsinstitute, "
    "Versicherer).\n\n"
    "RELEVANT sind nur Meldungen mit regulatorischem Gehalt: neue oder geänderte "
    "Gesetze und Verordnungen, Gesetzentwürfe, Konsultationen, Leitlinien, "
    "technische Standards (RTS/ITS), Rundschreiben, Merkblätter, Q&As, "
    "Meldewesen-Taxonomien, Urteile mit Aufsichtsbezug, Fristen sowie "
    "aufsichtliche Maßnahmen und Mitteilungen mit Pflichtenbezug.\n\n"
    "NICHT RELEVANT sind: Warnungen vor Betrug/Phishing/unerlaubten Anbietern, "
    "Veranstaltungen, Reden, Panels, Interviews, Personalien, Newsletter, "
    "Stellenausschreibungen, reine Statistiken oder Dashboards ohne "
    "Pflichtenbezug und sonstige PR-Meldungen.\n\n"
    "Du erhältst eine JSON-Liste von Objekten mit id und text. Antworte "
    "ausschließlich mit einem JSON-Objekt, das jede id auf true (relevant) "
    "oder false (nicht relevant) abbildet. Keine Erklärungen."
)


def api_key() -> Optional[str]:
    return os.environ.get("OPENROUTER_API_KEY") or None


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_relevance (
               document_id INTEGER PRIMARY KEY REFERENCES documents(document_id),
               relevant    INTEGER NOT NULL,
               model       TEXT NOT NULL,
               checked_at  TEXT NOT NULL
           )""")
    conn.commit()


def _chat(model: str, key: str, items: List[Tuple[int, str]]) -> Dict[int, bool]:
    payload = {
        "model": model,
        "temperature": 0,
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
    # Manche Modelle verpacken JSON in Markdown-Zäune.
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    parsed = json.loads(content)
    # Manche Modelle liefern statt {"id": bool} eine Liste von
    # {"id": ..., "relevant": ...}-Objekten.
    if isinstance(parsed, list):
        merged = {}
        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            if "id" in entry:
                merged[str(entry["id"])] = entry.get("relevant")
            else:
                merged.update({str(k): v for k, v in entry.items()})
        parsed = merged
    out: Dict[int, bool] = {}
    for i, _ in items:
        v = parsed.get(str(i), parsed.get(i))
        if isinstance(v, bool):
            out[i] = v
    return out


def classify(conn: sqlite3.Connection, items: List[Tuple[int, str]]) -> Dict[int, bool]:
    """items: Liste (document_id, "Titel – Zusammenfassung").

    Rückgabe: document_id -> relevant. Ohne API-Key oder bei API-Fehlern
    gelten unklassifizierte Dokumente als relevant (fail-open), werden dann
    aber nicht gecacht und beim nächsten Lauf erneut versucht.
    """
    _ensure_table(conn)
    result: Dict[int, bool] = {}
    cached = conn.execute(
        "SELECT document_id, relevant FROM llm_relevance WHERE document_id IN ({})".format(
            ",".join("?" * len(items)) or "NULL"),
        [i for i, _ in items]).fetchall() if items else []
    for row in cached:
        result[row[0]] = bool(row[1])

    todo = [(i, t) for i, t in items if i not in result]
    key = api_key()
    if not key:
        for i, _ in todo:
            result[i] = True
        return result

    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
    from .db import utcnow
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start:start + BATCH_SIZE]
        try:
            verdicts = _chat(model, key, batch)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                TimeoutError, TypeError, AttributeError, IndexError) as e:
            print("LLM-Filter: Batch übersprungen ({}: {})".format(type(e).__name__, e))
            verdicts = {}
        for i, _ in batch:
            if i in verdicts:
                result[i] = verdicts[i]
                conn.execute(
                    "INSERT OR REPLACE INTO llm_relevance VALUES (?,?,?,?)",
                    (i, int(verdicts[i]), model, utcnow()))
            else:
                result[i] = True  # fail-open, nicht cachen
        conn.commit()
    return result
