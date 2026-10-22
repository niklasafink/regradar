#!/usr/bin/env python3
"""Radar-Entscheidungen aus der Checklisten-Mail abarbeiten (aus run_hourly.sh).

Niklas entscheidet im Browser (Link in der Mail, /api/radar/item). Dieser Lauf
holt die Punkte mit Auftrag von der Website (GET /api/radar):

  analysis_requested  Claude Code headless (nur lesen) erstellt nach
                      scraper/RADAR_ACTIONS.md eine Analyse mit Vorschlag und
                      Links; sie steht danach auf der Entscheidungsseite.
  approved            Die freigegebene Entscheidung wird umgesetzt:
                        eigenstaendig / abgedeckt / ignorieren  → nur vermerkt
                        dublette-behalte-a|b                    → Dublette
                          unterdrücken (dedup_suppressed), export-web, Commit
                        aufnehmen / neue-quelle                 → Claude Code
                          ändert Code, danach Tests, Commit, Push

Änderungen am Repo nur, wenn das Arbeitsverzeichnis sauber ist (sonst wartet
der Punkt auf den nächsten Stundenlauf) und nur in den erlaubten Pfaden.
Scheitert eine Analyse zweimal, landet der Punkt als „fehlgeschlagen“ auf der
Seite; Niklas kann sie neu anfordern oder nichts tun.

  python3 radar_actions.py          regulärer Aufruf (Stundenlauf)
  python3 radar_actions.py --dry    nur die offenen Aufträge anzeigen
"""
import datetime as dt
import json
import os
import shutil
import sys
from typing import List, Optional, Tuple

SCRAPER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRAPER)

from regradar import db as dbmod, radarapi  # noqa: E402
from regradar.cli import _load_env  # noqa: E402
from newsletter_qa import (  # noqa: E402
    CLAUDE_ALLOWED_TOOLS, CLAUDE_READONLY_TOOLS, CLAUDE_TIMEOUT, PY, REPO,
    TEST_TIMEOUT, apply_changes, git_changes, revert, run)

DATA = os.path.join(SCRAPER, "data")
STATE_FILE = os.path.join(DATA, "radar_actions_state.json")
ITEM_FILE = os.path.join(DATA, "radar_item.json")
RESULT_FILE = os.path.join(DATA, "radar_result.json")
INSTRUCTIONS = os.path.join(SCRAPER, "RADAR_ACTIONS.md")
MAX_ATTEMPTS = 2
NOTE_ONLY = {"eigenstaendig", "abgedeckt", "ignorieren"}
CODE_EDITS = {"aufnehmen", "neue-quelle"}


def log(msg: str) -> None:
    print("[radar-actions] " + msg, flush=True)


def load_state() -> dict:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def run_claude(item: dict, mode: str) -> Tuple[bool, Optional[dict], str]:
    """(gelaufen, Ergebnisdatei als dict, Hinweis). mode: 'analyse' | 'umsetzung'."""
    exe = shutil.which("claude") or ("/usr/local/bin/claude" if os.path.exists("/usr/local/bin/claude") else None)
    if not exe:
        return False, None, "Claude Code (claude) ist nicht installiert"
    with open(ITEM_FILE, "w", encoding="utf-8") as f:
        json.dump(item, f, ensure_ascii=False, indent=2)
    try:
        os.remove(RESULT_FILE)
    except OSError:
        pass
    with open(INSTRUCTIONS, encoding="utf-8") as f:
        instructions = f.read()
    prompt = (
        "Du arbeitest im Projekt Regulatory Radar (Arbeitsverzeichnis = Repo-Root). "
        "Heute ist {today}. Bearbeite den Punkt in scraper/data/radar_item.json im "
        "Modus „{mode}“ nach der folgenden Anweisung.\n\n{ins}"
    ).format(today=dt.date.today().strftime("%d.%m.%Y"), mode=mode, ins=instructions)
    tools = CLAUDE_READONLY_TOOLS + ",Write" if mode == "analyse" else CLAUDE_ALLOWED_TOOLS
    model = os.environ.get("RADAR_ACTIONS_MODEL", "opus")
    cmd = [exe, "-p", prompt, "--output-format", "json", "--permission-mode", "acceptEdits",
           "--allowedTools", tools, "--max-turns", "120",
           "--no-session-persistence", "--model", model]
    log("claude -p ({}, Modell {}) für {} …".format(mode, model, item["id"]))
    rc, out = run(cmd, CLAUDE_TIMEOUT)
    if rc != 0:
        return False, None, "claude -p fehlgeschlagen (Exit {}): {}".format(rc, out[-500:])
    try:
        with open(RESULT_FILE, encoding="utf-8") as f:
            return True, json.load(f), ""
    except (OSError, ValueError):
        return False, None, "Ergebnisdatei fehlte oder war ungültig"


def analyse(item: dict, state: dict) -> None:
    tries = state.setdefault("analysis", {}).get(item["id"], 0) + 1
    state["analysis"][item["id"]] = tries
    save_state(state)
    ok, result, note = run_claude(item, "analyse")
    if ok and result and result.get("proposal"):
        radarapi.post_analysis(item["id"], str(result["proposal"]), str(result.get("code") or ""),
                               result.get("links") or [])
        state["analysis"].pop(item["id"], None)
        save_state(state)
        log("Analyse gespeichert: {}".format(item["id"]))
        return
    log("Analyse gescheitert ({}): {}".format(item["id"], note))
    if tries >= MAX_ATTEMPTS:
        radarapi.post_result(item["id"], False, "Die Analyse ist zweimal gescheitert: " + note)


def suppress_duplicate(item: dict, code: str) -> Tuple[bool, str]:
    meta = item.get("meta") or {}
    ids = meta.get("ids") or []
    if len(ids) != 2 or None in ids or meta.get("dedup_kind") not in ("document", "big4"):
        return False, "Die Ids der Dubletten-Einträge fehlen, bitte von Hand lösen."
    keep, drop = (ids[0], ids[1]) if code.endswith("a") else (ids[1], ids[0])
    from regradar.dedup import ensure_tables
    conn = dbmod.connect()
    try:
        ensure_tables(conn)
        conn.execute("INSERT OR REPLACE INTO dedup_suppressed VALUES (?,?,?,?,?)",
                     (meta["dedup_kind"], drop, keep,
                      "Entscheidung per Checklisten-Mail ({})".format(code), dbmod.utcnow()))
        conn.commit()
    finally:
        conn.close()
    return True, "Eintrag {} unterdrückt, Eintrag {} bleibt.".format(drop, keep)


def execute(item: dict) -> None:
    code = (item.get("decision") or {}).get("code") or ""
    comment = item.get("comment") or ""
    if code in NOTE_ONLY:
        radarapi.post_result(item["id"], True, "Entscheidung „{}“ vermerkt, am Bestand ändert sich nichts.{}".format(
            code, "\nAnweisung: " + comment if comment else ""))
        log("{}: vermerkt ({})".format(item["id"], code))
        return

    before_tracked, before_untracked = git_changes()
    if before_tracked or before_untracked:
        log("{}: Arbeitsverzeichnis nicht sauber, Umsetzung wartet".format(item["id"]))
        return

    if code.startswith("dublette-behalte-"):
        ok, report = suppress_duplicate(item, code)
        if ok:
            rc, out = run([PY, "-m", "regradar", "export-web"], TEST_TIMEOUT, cwd=SCRAPER)
            if rc != 0:
                ok, report = False, "export-web fehlgeschlagen: " + out[-400:]
            else:
                ok, note, sha = apply_changes(
                    before_tracked, before_untracked,
                    "Radar-Entscheidung {}: Dublette aufgelöst\n\nPunkt {}, per Browser freigegeben.".format(
                        dt.date.today().strftime("%d.%m.%Y"), item["id"]))
                report += " " + (note or ("Veröffentlicht mit Commit " + sha[:8] if sha else "Keine Änderung im Export."))
        radarapi.post_result(item["id"], ok, report)
        log("{}: Dublette ({})".format(item["id"], "ok" if ok else "fehlgeschlagen"))
        return

    if code in CODE_EDITS:
        ok_run, result, note = run_claude(item, "umsetzung")
        if not ok_run or not result:
            revert(*(s - b for s, b in zip(git_changes(), (before_tracked, before_untracked))))
            radarapi.post_result(item["id"], False, note)
            return
        report = str(result.get("report") or "")
        ok = result.get("ok") is True
        if ok:
            applied, note, sha = apply_changes(
                before_tracked, before_untracked,
                "Radar-Entscheidung {}: {}\n\nPunkt {}, per Browser freigegeben.".format(
                    dt.date.today().strftime("%d.%m.%Y"), code, item["id"]))
            ok = applied
            if note:
                report += "\n\n" + note
            elif sha:
                report += "\n\nCommit {} gepusht, Deploy läuft über Vercel.".format(sha[:8])
        else:
            revert(*(s - b for s, b in zip(git_changes(), (before_tracked, before_untracked))))
        radarapi.post_result(item["id"], ok, report)
        log("{}: {} ({})".format(item["id"], code, "ok" if ok else "fehlgeschlagen"))
        return

    radarapi.post_result(item["id"], False, "Unbekannter Entscheidungscode „{}“.".format(code))


def main(argv: List[str]) -> int:
    _load_env()
    items = radarapi.fetch(["analysis_requested", "approved"])
    if "--dry" in argv:
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return 0
    if not items:
        return 0
    state = load_state()
    for item in items:
        try:
            if item["status"] == "analysis_requested":
                analyse(item, state)
            elif item["status"] == "approved":
                execute(item)
        except RuntimeError as e:
            log("{}: Fehler: {}".format(item.get("id"), e))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except RuntimeError as e:
        log("Fehler: {}".format(e))
        sys.exit(1)
