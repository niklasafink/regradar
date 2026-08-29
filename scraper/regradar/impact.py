"""LLM-Impact-Einstufung für den Web-Export.

Beurteilt pro exportiertem Update den Impact für die Zielgruppe
(hoch/mittel/gering) anhand des Regelwerks in scraper/IMPACT.md — der
Abschnitt zwischen den PROMPT-Markern dort ist der System-Prompt.
Ergebnisse werden pro Dokument in der SQLite-DB gecacht (versioniert
über FORMAT).

Ohne OPENROUTER_API_KEY ist das Modul inaktiv; das Frontend fällt dann
auf die Dokumenttyp-Heuristik in web/lib/logic.ts zurück.
"""
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Tuple

from .llmfilter import API_URL, api_key

DEFAULT_MODEL = "google/gemini-2.5-flash"
BATCH_SIZE = 10
TIMEOUT = 120

# Format-Version der Einstufung. Bei Änderungen am Regelwerk in IMPACT.md
# hochzählen – der nächste Export stuft dann alle Updates neu ein.
FORMAT = 1

RULES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "IMPACT.md")

VALID = ("high", "medium", "low")

# Modelle antworten trotz Formatvorgabe gelegentlich mit den deutschen
# Stufenbezeichnungen aus dem Regelwerk.
NORMALIZE = {"high": "high", "hoch": "high",
             "medium": "medium", "mittel": "medium",
             "low": "low", "gering": "low", "niedrig": "low"}


def _rules() -> str:
    with open(RULES_PATH, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"<!-- PROMPT-START -->(.*?)<!-- PROMPT-END -->",
                  text, re.DOTALL)
    if not m:
        raise ValueError("IMPACT.md: PROMPT-Marker nicht gefunden")
    return m.group(1).strip()


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_impact (
               document_id INTEGER PRIMARY KEY REFERENCES documents(document_id),
               impact      TEXT NOT NULL,
               reason      TEXT NOT NULL,
               model       TEXT NOT NULL,
               created_at  TEXT NOT NULL,
               fmt         INTEGER NOT NULL
           )""")
    conn.commit()


def _chat(model: str, key: str, prompt: str,
          items: List[Tuple[int, str]]) -> Dict[int, Dict[str, str]]:
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": prompt},
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
        if not isinstance(v, dict):
            continue
        impact = NORMALIZE.get(str(v.get("impact", "")).strip().lower())
        if impact:
            out[i] = {"impact": impact,
                      "reason": str(v.get("grund") or v.get("reason") or "").strip()}
    return out


def assess(conn: sqlite3.Connection,
           items: List[Tuple[int, str]]) -> Dict[int, str]:
    """items: Liste (document_id, Kontexttext – wie für die Zusammenfassung).

    Rückgabe: document_id -> "high" | "medium" | "low". Ohne API-Key oder
    bei API-Fehlern fehlen die betroffenen ids; das Frontend nutzt dann
    seine Dokumenttyp-Heuristik als Fallback.
    """
    _ensure_table(conn)
    result: Dict[int, str] = {}
    if items:
        cached = conn.execute(
            "SELECT document_id, impact FROM llm_impact "
            "WHERE fmt=? AND document_id IN ({})".format(
                ",".join("?" * len(items))),
            [FORMAT] + [i for i, _ in items]).fetchall()
        for row in cached:
            result[row[0]] = row[1]

    todo = [(i, t) for i, t in items if i not in result]
    key = api_key()
    if not key or not todo:
        return result

    prompt = _rules()
    model = os.environ.get("OPENROUTER_IMPACT_MODEL", DEFAULT_MODEL)
    from .db import utcnow
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start:start + BATCH_SIZE]
        got = {}
        for attempt in (1, 2):
            try:
                got = _chat(model, key, prompt, batch)
                break
            except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                    TimeoutError) as e:
                print("LLM-Impact: Versuch {} fehlgeschlagen ({}: {})".format(
                    attempt, type(e).__name__, e))
        for i, v in got.items():
            result[i] = v["impact"]
            conn.execute(
                "INSERT OR REPLACE INTO llm_impact VALUES (?,?,?,?,?,?)",
                (i, v["impact"], v["reason"], model, utcnow(), FORMAT))
        conn.commit()
    return result
