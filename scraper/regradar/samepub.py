"""Pressemitteilung + Dokument derselben Veröffentlichung zusammenführen.

Behörden melden eine Neuerung oft zweimal unter verschiedenen Titeln: die
Konsultations-/Dokumentseite ("Consultation on the draft Supervisory
Statement on IBIP Sales Processes") und die Pressemitteilung dazu ("EIOPA
seeks views on a more proportionate … supervision of sales of insurance-
based investment products"). Titelvergleich (dedup.py, _is_shadow) greift
da nicht. Für den Leser ist es EINE Neuerung (Befund 14.10.2026: EIOPA
IBIP doppelt, ESMA-Stellungnahme zu nicht MiCA-konformen Tokens doppelt,
BaFin-Aufsichtsmitteilung 08/2026 dreifach).

Kandidaten sind Paare derselben Behörde, aus demselben Rahmenwerk und mit
höchstens WINDOW_DAYS Abstand, von denen mindestens eines eine Meldung
(Typ OTHER) ist. Ob es dieselbe Veröffentlichung ist, entscheidet ein LLM;
das Urteil wird je Paar gecacht. Ohne API-Key oder bei Fehlern bleibt
alles stehen (fail-open).
"""
import json
import os
import sqlite3
import urllib.error
from itertools import combinations
from typing import Dict, List, Set, Tuple

from .llmfilter import DEFAULT_MODEL, _post_json, api_key

WINDOW_DAYS = 2
BATCH_SIZE = 20
FORMAT = 1

# Entfernt nur Dokumente, die nach dem letzten Versand vor Einführung der
# Regel erstmals gesehen wurden (08.10.2026, 15:19 UTC): Ältere stehen in
# verschickten Newslettern, ihre /u/-Links dürfen nicht ins Leere laufen.
STRICT_SINCE = "2026-10-08T15:20:00Z"

SYSTEM_PROMPT = (
    "Du prüfst Paare regulatorischer Meldungen derselben Behörde. Antworte "
    "für jedes Paar mit true, wenn beide dieselbe Veröffentlichung betreffen "
    "– z. B. eine Konsultation, Leitlinie, Stellungnahme oder "
    "Aufsichtsmitteilung und die Pressemitteilung bzw. Meldung, die genau "
    "dieses Dokument ankündigt oder erläutert. Antworte false, wenn es zwei "
    "verschiedene Dokumente sind, auch wenn sie dasselbe Thema oder "
    "Rahmenwerk betreffen (z. B. zwei verschiedene Q&As, zwei Konsultationen "
    "zu verschiedenen Standards, Sanktionsverordnungen zu verschiedenen "
    "Ländern).\n\n"
    "Du erhältst eine JSON-Liste von Objekten {id, a, b}. Antworte "
    "ausschließlich mit einem JSON-Objekt, das jede id auf true oder false "
    "abbildet. Keine Erklärungen."
)


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_samepub (
               doc_a      INTEGER NOT NULL,
               doc_b      INTEGER NOT NULL,
               same       INTEGER NOT NULL,
               model      TEXT NOT NULL,
               checked_at TEXT NOT NULL,
               fmt        INTEGER NOT NULL,
               PRIMARY KEY (doc_a, doc_b)
           )""")
    conn.commit()


def _chat(model: str, key: str, items: List[dict]) -> Dict[str, bool]:
    parsed = _post_json(model, key, SYSTEM_PROMPT,
                        json.dumps(items, ensure_ascii=False))
    out: Dict[str, bool] = {}
    for it in items:
        v = parsed.get(it["id"]) if isinstance(parsed, dict) else None
        if isinstance(v, bool):
            out[it["id"]] = v
    return out


def _text(r, clean) -> str:
    return "{} – {}".format(clean(r["title"], 200), clean(r["summary"], 500))


def _keep_rank(r, doc_type) -> Tuple[int, int, int]:
    """Welche Fassung bleibt: das Dokument selbst vor der Meldung darüber,
    eine Konsultation mit Frist zuerst, sonst die zuerst gesehene."""
    t = doc_type(r)
    return (0 if r["consultation_deadline"] else 1,
            1 if t == "OTHER" else 0,
            r["document_id"])


def duplicates(conn: sqlite3.Connection, selected: list, doc_type, days_apart,
               clean) -> Set[int]:
    """selected: Liste (row, fw_id, date). Rückgabe: document_ids, die als
    zweite Fassung derselben Veröffentlichung entfallen."""
    # ESMA-Library und ESMA-News sind dieselbe Behörde (Dokument + Presse-
    # mitteilung, 08.10.2026: Stellungnahme zu nicht MiCA-konformen Tokens).
    from .webexport import SAME_AUTHORITY_SOURCES, SHADOW_SOURCES

    def family(r) -> str:
        sid = r["source_id"]
        return SHADOW_SOURCES.get(sid) or SAME_AUTHORITY_SOURCES.get(sid, sid)

    pairs = []
    for (r1, fw1, _), (r2, fw2, _) in combinations(selected, 2):
        if family(r1) != family(r2) or fw1 != fw2:
            continue
        if "OTHER" not in (doc_type(r1), doc_type(r2)):
            continue
        d1 = (r1["publication_date"] or r1["first_seen_at"] or "")[:10]
        d2 = (r2["publication_date"] or r2["first_seen_at"] or "")[:10]
        gap = days_apart(d1, d2)
        if gap is None or gap > WINDOW_DAYS:
            continue
        a, b = sorted((r1, r2), key=lambda r: r["document_id"])
        pairs.append((a, b))
    if not pairs:
        return set()

    _ensure_table(conn)
    verdict: Dict[Tuple[int, int], bool] = {}
    for a, b in pairs:
        row = conn.execute(
            "SELECT same FROM llm_samepub WHERE doc_a=? AND doc_b=? AND fmt=?",
            (a["document_id"], b["document_id"], FORMAT)).fetchone()
        if row:
            verdict[(a["document_id"], b["document_id"])] = bool(row[0])

    todo = [(a, b) for a, b in pairs
            if (a["document_id"], b["document_id"]) not in verdict]
    key = api_key()
    if todo and key:
        model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
        from .db import utcnow
        for start in range(0, len(todo), BATCH_SIZE):
            batch = todo[start:start + BATCH_SIZE]
            items = [{"id": "{}-{}".format(a["document_id"], b["document_id"]),
                      "a": _text(a, clean), "b": _text(b, clean)} for a, b in batch]
            try:
                got = _chat(model, key, items)
            except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                    OSError, TypeError, AttributeError, IndexError, ValueError) as e:
                print("Samepub: Batch übersprungen ({}: {})".format(type(e).__name__, e))
                continue
            for a, b in batch:
                v = got.get("{}-{}".format(a["document_id"], b["document_id"]))
                if v is None:
                    continue
                verdict[(a["document_id"], b["document_id"])] = v
                conn.execute(
                    "INSERT OR REPLACE INTO llm_samepub VALUES (?,?,?,?,?,?)",
                    (a["document_id"], b["document_id"], int(v), model, utcnow(), FORMAT))
            conn.commit()

    drop: Set[int] = set()
    for a, b in pairs:
        if not verdict.get((a["document_id"], b["document_id"])):
            continue
        keep, other = sorted((a, b), key=lambda r: _keep_rank(r, doc_type))
        if (other["first_seen_at"] or "") >= STRICT_SINCE and keep["document_id"] not in drop:
            drop.add(other["document_id"])
    return drop
