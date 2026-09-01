"""KI-Prüfroutine für den Praxis-Bestand vor dem Web-Export.

Prüft die gescrapten Kurztexte der Praxis-Einträge (Bußgelder, Verwarnungen,
Maßnahmen) per LLM auf offensichtliche Textfehler — abgeschnittene
Satzanfänge ("000 Euro festgesetzt" statt "… 16.000 Euro festgesetzt"),
zerrissene Wörter/Zahlen, HTML- oder Navigationsreste — BEVOR sie in
live.json landen (Seite /praxis und monatlicher Praxis-Newsletter lesen
beide daraus). Beanstandete Texte werden per LLM aus dem Original-Rohtext
neu extrahiert (nur ganze Sätze im Original-Wortlaut, keine Umformulierung).

Ergebnisse werden pro Text-Hash in der SQLite-DB gecacht (versioniert über
FORMAT), sodass jeder Text nur einmal geprüft wird. Ohne OPENROUTER_API_KEY
greift eine Heuristik: Texte, die nicht an einem plausiblen Satzanfang
beginnen, werden durch einen Wortgrenzen-Schnitt vom Anfang des Rohtexts
ersetzt (nicht gecacht, damit der nächste Lauf mit Key sauber prüft).
"""
import hashlib
import json
import re
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

from .db import utcnow
from .llmfilter import API_URL, api_key

DEFAULT_MODEL = "google/gemini-2.5-flash-lite"
BATCH_SIZE = 25
TIMEOUT = 90
SUMMARY_LIMIT = 360

# Bei Prompt-/Regeländerungen hochzählen — der nächste Export prüft dann
# alle Texte neu.
FORMAT = 1

CHECK_PROMPT = (
    "Du prüfst deutsche Kurztexte für einen Regulatory-News-Dienst vor der "
    "Veröffentlichung. Ein Text ist IN ORDNUNG, wenn er ein sauberer, "
    "vollständig lesbarer Fließtext ist: Er beginnt an einem echten "
    "Satzanfang, endet mit einem vollständigen Satz und enthält keine "
    "abgeschnittenen Wörter oder Zahlen (fehlerhaft wäre z. B. ein Text, "
    "der mit '000 Euro festgesetzt' beginnt — Rest einer zerschnittenen "
    "Zahl wie '16.000 Euro'), keine HTML-Reste und keine Navigations-, "
    "Cookie- oder Menü-Artefakte. Stil, Rechtschreibung und Inhalt sind "
    "NICHT Prüfgegenstand.\n\n"
    "Du erhältst eine JSON-Liste von Objekten mit id und text. Antworte "
    "ausschließlich mit einem JSON-Objekt, das jede id auf true (in "
    "Ordnung) oder false (fehlerhaft) abbildet. Keine Erklärungen."
)

REPAIR_PROMPT = (
    "Du bereinigst einen gescrapten Behörden-Kurztext für einen "
    "Regulatory-News-Dienst. Du erhältst den Original-Rohtext einer "
    "Meldung. Extrahiere daraus eine Kurzbeschreibung von höchstens "
    "{limit} Zeichen: nur ganze Sätze vom Anfang des eigentlichen "
    "Meldungstexts, im Original-Wortlaut, ohne Umformulierung und ohne "
    "Auslassungen mitten im Satz. Lass HTML-, Navigations- und "
    "Cookie-Reste weg. Antworte ausschließlich mit dem extrahierten Text, "
    "ohne Anführungszeichen oder Erklärungen."
)


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS praxis_qa (
               text_hash  TEXT NOT NULL,
               format     INTEGER NOT NULL,
               ok         INTEGER NOT NULL,
               fixed      TEXT,
               model      TEXT NOT NULL,
               checked_at TEXT NOT NULL,
               PRIMARY KEY (text_hash, format)
           )""")
    conn.commit()


def _hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _chat(model: str, key: str, system: str, user: str,
          json_mode: bool = True) -> str:
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer {}".format(key),
            "Content-Type": "application/json",
        })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"].strip()
    return content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def _verify_batch(model: str, key: str,
                  items: List[Tuple[int, str]]) -> Dict[int, bool]:
    content = _chat(model, key, CHECK_PROMPT, json.dumps(
        [{"id": i, "text": t} for i, t in items], ensure_ascii=False))
    parsed = json.loads(content)
    # Manche Modelle liefern trotz Anweisung eine Liste von {id, …}-Objekten
    # oder verschachteln das Ergebnis unter einem einzelnen Schlüssel.
    if isinstance(parsed, dict) and len(parsed) == 1:
        inner = next(iter(parsed.values()))
        if isinstance(inner, (dict, list)):
            parsed = inner
    if isinstance(parsed, list):
        merged = {}
        for el in parsed:
            if not isinstance(el, dict):
                continue
            if "id" in el:
                vals = [v for k, v in el.items() if k != "id"]
                if len(vals) == 1:
                    merged[el["id"]] = vals[0]
            else:
                merged.update(el)
        parsed = merged
    out = {}
    for i, _ in items:
        v = parsed.get(str(i), parsed.get(i))
        if isinstance(v, bool):
            out[i] = v
    return out


def _repair(model: str, key: str, raw: str) -> Optional[str]:
    fixed = _chat(model, key,
                  REPAIR_PROMPT.format(limit=SUMMARY_LIMIT),
                  raw[:6000], json_mode=False)
    # Plausibilitätsnetz: nicht leer, nicht ausgeufert, plausibler Satzanfang.
    if not fixed or len(fixed) > SUMMARY_LIMIT + 80 or _suspicious_start(fixed):
        return None
    return fixed


def _suspicious_start(text: str) -> bool:
    """Beginnt der Text nicht an einem plausiblen Satzanfang (Großbuchstabe,
    Anführungszeichen, Paragraf …), ist er wahrscheinlich abgeschnitten."""
    return not re.match(r"^[A-ZÄÖÜ\"„“'‚(§€]", text)


def _fallback(raw: str, limit: int = SUMMARY_LIMIT) -> str:
    """Notbehelf ohne LLM: Wortgrenzen-Schnitt vom Textanfang — beginnt
    garantiert am Anfang der Meldung, endet ggf. mit Ellipse."""
    text = " ".join(re.sub(r"<[^>]+>", " ", raw).split())
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + " …"
    return text


def check_praxis(conn: sqlite3.Connection,
                 entries: List[dict],
                 raws: List[Optional[str]],
                 model: str = DEFAULT_MODEL) -> Dict[str, int]:
    """Prüft (und repariert) die "sum"-Texte der Praxis-Einträge in place.

    entries/raws laufen parallel: raws[i] ist der ungekürzte Rohtext
    (documents.summary) zu entries[i], als Grundlage für Reparaturen.
    Gibt Zählwerte für das Export-Log zurück.
    """
    _ensure_table(conn)
    stats = {"qa_checked": 0, "qa_flagged": 0, "qa_repaired": 0}
    key = api_key()

    # Cache anwenden, offene Texte einsammeln.
    pending: List[Tuple[int, str]] = []  # (index, hash)
    for idx, entry in enumerate(entries):
        s = entry.get("sum")
        if not s:
            continue
        h = _hash(s)
        row = conn.execute(
            "SELECT ok, fixed FROM praxis_qa WHERE text_hash=? AND format=?",
            (h, FORMAT)).fetchone()
        if row is not None:
            if not row["ok"]:
                stats["qa_flagged"] += 1
                if row["fixed"]:
                    entry["sum"] = row["fixed"]
                    stats["qa_repaired"] += 1
                elif raws[idx]:
                    entry["sum"] = _fallback(raws[idx])
            continue
        pending.append((idx, h))

    if not pending:
        return stats

    if not key:
        # Ohne Key nur Heuristik, ohne Cache-Eintrag (nächster Lauf mit
        # Key prüft dann richtig).
        for idx, _ in pending:
            if _suspicious_start(entries[idx]["sum"]):
                stats["qa_flagged"] += 1
                if raws[idx]:
                    entries[idx]["sum"] = _fallback(raws[idx])
                    stats["qa_repaired"] += 1
        return stats

    for start in range(0, len(pending), BATCH_SIZE):
        batch = pending[start:start + BATCH_SIZE]
        try:
            verdicts = _verify_batch(
                model, key, [(idx, entries[idx]["sum"]) for idx, _ in batch])
        except (urllib.error.URLError, json.JSONDecodeError, ValueError,
                TypeError, AttributeError, KeyError, TimeoutError, OSError):
            continue  # Prüfung ist Netz, kein Gate: Export läuft weiter
        for idx, h in batch:
            ok = verdicts.get(idx)
            if ok is None:
                continue
            stats["qa_checked"] += 1
            fixed = None
            if not ok:
                stats["qa_flagged"] += 1
                if raws[idx]:
                    try:
                        fixed = _repair(model, key, raws[idx])
                    except (urllib.error.URLError, json.JSONDecodeError,
                            KeyError, TimeoutError, OSError):
                        fixed = None
                    if not fixed:
                        fixed = _fallback(raws[idx])
                    entries[idx]["sum"] = fixed
                    stats["qa_repaired"] += 1
            conn.execute(
                """INSERT OR REPLACE INTO praxis_qa
                   (text_hash, format, ok, fixed, model, checked_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (h, FORMAT, 1 if ok else 0, fixed, model, utcnow()))
        conn.commit()
    return stats
