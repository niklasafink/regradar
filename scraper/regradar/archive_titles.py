"""Deutsche und englische Anzeigetexte für Altbestand aus Luxemburg ohne OpenRouter.

Das CSSF-Archiv (cssf_archive), Legilux und die Chambre-Dossiers liefern nur
Titel und Untertitel (CSSF) bzw. den amtlichen Titel (Legilux, Chambre, auf
Französisch). Eine volle LLM-Zusammenfassung je Altdokument wäre teuer und
ohne Volltext erfunden. Stattdessen übersetzt `claude -p` (Abo-Kontingent, wie
scope.py) nur, was in Titel und Untertitel steht, und schreibt das Ergebnis in
den Cache `llm_summary` (fmt = summarize.FORMAT). Der Export nimmt es von dort.

Aufruf: python3 -m regradar archive-titles [--limit N]
"""
import json
import os
import re
import shutil
import sqlite3
import subprocess
from typing import Dict, List, Optional

from .db import utcnow
from .summarize import FORMAT, _ensure_table

SOURCES = ("cssf_archive", "cssf", "legilux", "chd")
BATCH = 12
TIMEOUT = 420
MODEL = "sonnet"

SYSTEM = (
    "Du erzeugst Anzeigetexte für einen Regulatory-News-Dienst (Leser: Compliance-Officer in "
    "Fondsmanagern und Banken mit Bezug zu Luxemburg). Du bekommst Meldungen mit Quelle, Dokumenttyp, "
    "Datum, Titel und Untertitel (Englisch oder Französisch). Du kennst NUR diese Angaben: Erfinde nichts, "
    "füge keinen Inhalt aus eigenem Wissen hinzu und nenne keine Pflichten, Fristen oder Zahlen, die nicht im "
    "Titel oder Untertitel stehen.\n\n"
    "Je Meldung lieferst du:\n"
    '- "ti": {"de": ..., "en": ...} ein Anzeigetitel, deutsch (max. ca. 100 Zeichen), mit der Kennung vorn '
    '(z. B. "Rundschreiben 11/512: Risikomanagement ..."). Englische Eigenbegriffe und Rechtsaktnamen bleiben '
    "(UCITS bleibt \"OGAW\", wenn der Titel es so nennt, sonst UCITS; ESMA, DORA, eDesk, Q&A, RTS/ITS bleiben). "
    "Kryptische Titel ohne Untertitel beschreibend ergänzen, die Kennung bleibt erhalten.\n"
    '- "s": {"de": ..., "en": ...} ein bis zwei Sätze: Was regelt das Dokument laut Titel/Untertitel, '
    "für wen (nur wenn im Text genannt) und, falls der Status \"aufgehoben\" ist, dass es aufgehoben wurde. "
    "Keine Wertung, keine Handlungsempfehlung, keine Paragrafen-Exegese. Bei französischen Gesetzestiteln "
    "die geänderten Gesetze mit Kurzname nennen (z. B. \"ändert das OGA-Gesetz von 2010 und das AIFM-Gesetz "
    "von 2013\").\n"
    "Keine Versalien als Hervorhebung. Antworte ausschließlich mit einem JSON-Objekt, dessen Schlüssel die "
    "Nummern der Meldungen sind: {\"1\": {\"ti\": {...}, \"s\": {...}}, ...}."
)


def _todo(conn: sqlite3.Connection, limit: Optional[int]) -> List[sqlite3.Row]:
    q = ("SELECT d.document_id, d.source_id, d.title, d.document_type, d.publication_date, "
         "d.status, d.summary, d.reference_number FROM documents d "
         "WHERE d.source_id IN ({}) AND d.document_id NOT IN "
         "(SELECT document_id FROM llm_summary WHERE fmt=?) "
         "ORDER BY d.publication_date DESC".format(",".join("?" * len(SOURCES))))
    from .webexport import _classify
    rows = [r for r in conn.execute(q, list(SOURCES) + [FORMAT]).fetchall()
            if _classify("{} {}".format(r["title"] or "", r["summary"] or ""), source_id=r["source_id"],
                         title=r["title"])]
    return rows[:limit] if limit else rows


def _prompt(r) -> str:
    return "Quelle: {}\nTyp: {}\nDatum: {}\nStatus: {}\nTitel: {}\nUntertitel: {}".format(
        r["source_id"], r["document_type"], (r["publication_date"] or "")[:10],
        "aufgehoben" if (r["status"] or "").upper() == "REPEALED" else (r["status"] or "gültig"),
        (r["title"] or "")[:500], re.sub(r"\s+", " ", r["summary"] or "")[:700])


def _call(users: List[str]) -> List[Optional[dict]]:
    exe = shutil.which("claude") or "/usr/local/bin/claude"
    prompt = "MELDUNGEN:\n" + "\n\n".join("{}:\n{}".format(i + 1, u) for i, u in enumerate(users))
    env = dict(os.environ)
    for k in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"):
        env.pop(k, None)
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin:" + env.get("PATH", "")
    env["MAX_THINKING_TOKENS"] = "0"
    env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = str(700 * len(users) + 500)
    cmd = [exe, "-p", prompt, "--system-prompt", SYSTEM, "--tools", "", "--output-format", "json",
           "--max-turns", "1", "--no-session-persistence", "--model", MODEL,
           "--setting-sources", "project,local", "--disable-slash-commands",
           "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']
    p = subprocess.run(cmd, cwd="/tmp", capture_output=True, text=True, timeout=TIMEOUT, env=env)
    try:
        data = json.loads(p.stdout.strip().splitlines()[-1])
        if p.returncode != 0 or data.get("is_error"):
            print("archive-titles: abgelehnt: {}".format(str(data.get("result"))[:200]), flush=True)
            return [None] * len(users)
        text = str(data.get("result") or "")
        parsed = json.loads(text[text.find("{"):text.rfind("}") + 1])
    except (ValueError, IndexError):
        return [None] * len(users)
    return [parsed.get(str(i + 1)) if isinstance(parsed.get(str(i + 1)), dict) else None
            for i in range(len(users))]


def _valid(v: Optional[dict]) -> bool:
    try:
        return bool(v and v["ti"]["de"].strip() and v["ti"]["en"].strip()
                    and v["s"]["de"].strip() and v["s"]["en"].strip())
    except (KeyError, AttributeError, TypeError):
        return False


def run(conn: sqlite3.Connection, limit: Optional[int] = None) -> Dict[str, int]:
    _ensure_table(conn)
    rows = _todo(conn, limit)
    done = failed = 0
    for start in range(0, len(rows), BATCH):
        batch = rows[start:start + BATCH]
        try:
            got = _call([_prompt(r) for r in batch])
        except (subprocess.SubprocessError, OSError) as e:
            print("archive-titles: Paket fehlgeschlagen ({})".format(e), flush=True)
            got = [None] * len(batch)
        for r, v in zip(batch, got):
            if not _valid(v):
                failed += 1
                continue
            conn.execute(
                "INSERT OR REPLACE INTO llm_summary "
                "(document_id, de, en, model, created_at, fmt, ti_de, ti_en) VALUES (?,?,?,?,?,?,?,?)",
                (r["document_id"], v["s"]["de"].strip(), v["s"]["en"].strip(), "claude-archive",
                 utcnow(), FORMAT, v["ti"]["de"].strip(), v["ti"]["en"].strip()))
            done += 1
        conn.commit()
        print("archive-titles: {}/{} Dokumente".format(min(start + BATCH, len(rows)), len(rows)), flush=True)
    return {"neu": done, "fehler": failed, "offen": len(rows) - done}
