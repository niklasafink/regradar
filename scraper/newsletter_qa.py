#!/usr/bin/env python3
"""Automatische QS des wöchentlichen Update-Newsletters (aus run_hourly.sh).

Ab Donnerstag 10:00 UTC (Stichtag, web/lib/newsletter.ts → lastWeeklySlot)
läuft einmal pro Woche:

  1. Fällige Meldungen holen (GET /api/newsletter/qa). Liegt für den Slot
     schon ein QS-Ergebnis vor, ist nichts zu tun.
  2. Claude Code headless (claude -p) prüft sie nach scraper/NEWSLETTER_QA.md
     und behebt Fehler als Regeln im Scraper. Hatte das Arbeitsverzeichnis
     schon vorher Änderungen, läuft die QS im Modus „Nur prüfen“.
  3. Änderungen nur übernehmen, wenn die Tests grün sind: export-web,
     Commit, Push. Dann warten, bis Vercel den Commit ausgeliefert hat.
  4. Ergebnis melden (POST /api/newsletter/qa). Die Website verschickt
     daraufhin die Freigabe-Mail mit dem QS-Bericht an den Betreiber.

Scheitert Claude, gibt es einen zweiten Versuch im nächsten Stundenlauf;
danach geht die Freigabe-Mail mit Warnhinweis raus, damit der Versand nicht
hängen bleibt.

  python3 newsletter_qa.py            regulärer Aufruf (Stundenlauf)
  python3 newsletter_qa.py --force    QS für den aktuellen Slot erneut
  python3 newsletter_qa.py --dry      nur fällige Meldungen anzeigen

Auth über CRON_SECRET aus web/.env.local; optional NEWSLETTER_QA_MODEL
(Standard opus) und HEALTH_APP_URL.
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import List, Optional, Set, Tuple

SCRAPER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(SCRAPER)
sys.path.insert(0, SCRAPER)

from regradar.cli import _load_env  # noqa: E402
from regradar.health import app_url, load_web_env  # noqa: E402

PY = "/usr/bin/python3"
DATA = os.path.join(SCRAPER, "data")
STATE_FILE = os.path.join(DATA, "newsletter_qa_state.json")
PENDING_FILE = os.path.join(DATA, "newsletter_qa_pending.json")
RESULT_FILE = os.path.join(DATA, "newsletter_qa_result.json")
INSTRUCTIONS = os.path.join(SCRAPER, "NEWSLETTER_QA.md")

SLOT_WEEKDAY = 3  # Donnerstag (Python: Montag = 0)
SLOT_HOUR_UTC = 10
MAX_ATTEMPTS = 2
CLAUDE_TIMEOUT = 35 * 60
DEPLOY_TIMEOUT = 20 * 60
TEST_TIMEOUT = 10 * 60

# Pfade, die die QS ändern und committen darf (vgl. NEWSLETTER_QA.md, „Grenzen“).
ALLOWED_PREFIXES = ("scraper/regradar/", "scraper/tests/", "scraper/IMPACT.md")
ALLOWED_FILES = {"web/lib/data.ts", "web/lib/live.json", "web/lib/sources.json"}

CLAUDE_ALLOWED_TOOLS = (
    "Read,Grep,Glob,Edit,Write,WebFetch,"
    "Bash(python3 *),Bash(/usr/bin/python3 *),Bash(curl *),"
    "Bash(git diff *),Bash(git status *),Bash(git log *),Bash(git show *)"
)
CLAUDE_READONLY_TOOLS = (
    "Read,Grep,Glob,WebFetch,Bash(curl *),"
    "Bash(git diff *),Bash(git status *),Bash(git log *),Bash(git show *)"
)


def log(msg: str) -> None:
    print("[newsletter-qa] " + msg, flush=True)


def current_slot(now: dt.datetime) -> dt.datetime:
    """Jüngster Donnerstag 10:00 UTC, der nicht nach `now` liegt."""
    slot = now.replace(hour=SLOT_HOUR_UTC, minute=0, second=0, microsecond=0)
    slot -= dt.timedelta(days=(now.weekday() - SLOT_WEEKDAY) % 7)
    if slot > now:
        slot -= dt.timedelta(days=7)
    return slot


def api(method: str, body: Optional[dict] = None) -> dict:
    load_web_env()
    key = os.environ.get("CRON_SECRET")
    if not key:
        raise RuntimeError("CRON_SECRET fehlt (web/.env.local)")
    req = urllib.request.Request(
        app_url() + "/api/newsletter/qa", method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "User-Agent": "regradar-newsletter-qa/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError("HTTP {}: {}".format(e.code, e.read().decode("utf-8", "replace")[:300]))


def run(cmd: List[str], timeout: int, cwd: str = REPO) -> Tuple[int, str]:
    env = dict(os.environ)
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin:" + env.get("PATH", "")
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired as e:
        out = e.stdout.decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return 124, out + "\n(Timeout nach {} s)".format(timeout)


def load_state() -> dict:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def git_changes() -> Tuple[Set[str], Set[str]]:
    """(geänderte versionierte Dateien, neue unversionierte Dateien)."""
    _, out = run(["git", "status", "--porcelain", "--untracked-files=all"], 60)
    tracked, untracked = set(), set()
    for line in out.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].split(" -> ")[-1].strip().strip('"')
        (untracked if line.startswith("??") else tracked).add(path)
    return tracked, untracked


def allowed(path: str) -> bool:
    return path in ALLOWED_FILES or path.startswith(ALLOWED_PREFIXES)


def revert(tracked: Set[str], untracked: Set[str]) -> None:
    if tracked:
        run(["git", "checkout", "--"] + sorted(tracked), 60)
    for path in untracked:
        try:
            os.remove(os.path.join(REPO, path))
        except OSError:
            pass


def run_claude(pending: List[dict], check_only: bool) -> Tuple[bool, bool, str, str]:
    """(gelaufen, nichts offen, Bericht, Detail für das Log)."""
    exe = shutil.which("claude") or ("/usr/local/bin/claude" if os.path.exists("/usr/local/bin/claude") else None)
    if not exe:
        return False, False, "", "Claude Code (claude) ist nicht installiert"
    with open(PENDING_FILE, "w", encoding="utf-8") as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)
    try:
        os.remove(RESULT_FILE)
    except OSError:
        pass
    with open(INSTRUCTIONS, encoding="utf-8") as f:
        instructions = f.read()
    mode = (
        "Modus: Nur prüfen. Das Arbeitsverzeichnis hatte schon vor der QS "
        "Änderungen, du änderst deshalb keine Dateien außer der Ergebnisdatei. "
        "Nenne alle Befunde im Bericht als offene Punkte."
        if check_only else
        "Modus: Prüfen und beheben."
    )
    prompt = (
        "Du arbeitest im Projekt Regulatory Radar (Arbeitsverzeichnis = Repo-Root). "
        "Heute ist {today}. Führe die Newsletter-QS nach der folgenden Anweisung aus. "
        "{n} Meldungen stehen in scraper/data/newsletter_qa_pending.json.\n{mode}\n\n{ins}"
    ).format(today=dt.date.today().strftime("%d.%m.%Y"), n=len(pending), mode=mode, ins=instructions)
    model = os.environ.get("NEWSLETTER_QA_MODEL", "opus")
    tools = CLAUDE_READONLY_TOOLS + ",Write" if check_only else CLAUDE_ALLOWED_TOOLS
    cmd = [exe, "-p", prompt, "--output-format", "json", "--permission-mode", "acceptEdits",
           "--allowedTools", tools, "--max-turns", "150",
           "--no-session-persistence", "--model", model]
    log("claude -p läuft (Modell {}, {} Meldungen, {}) …".format(
        model, len(pending), "nur prüfen" if check_only else "prüfen und beheben"))
    rc, out = run(cmd, CLAUDE_TIMEOUT)
    data: dict = {}
    for candidate in (out.strip(), out.strip().splitlines()[-1] if out.strip() else ""):
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                data = parsed
                break
        except ValueError:
            continue
    meta = "{} Schritte, Kosten {}".format(
        data.get("num_turns", "?"),
        "{:.2f} USD".format(data["total_cost_usd"]) if isinstance(data.get("total_cost_usd"), (int, float)) else "?")
    if rc != 0 or data.get("is_error"):
        return False, False, "", "claude -p fehlgeschlagen (Exit {}, {}): {}".format(rc, meta, out[-800:])
    try:
        with open(RESULT_FILE, encoding="utf-8") as f:
            result = json.load(f)
        report = str(result.get("report") or "").strip()
        ok = result.get("ok") is True
    except (OSError, ValueError):
        report = (data.get("result") or "").strip()
        ok = False
        report = "Ergebnisdatei fehlte, Schlusswort der QS:\n" + report[-1500:]
    if not report:
        return False, False, "", "QS lieferte keinen Bericht ({})".format(meta)
    log("QS fertig ({})".format(meta))
    return True, ok, report, meta


def apply_changes(before_tracked: Set[str], before_untracked: Set[str],
                  subject: Optional[str] = None) -> Tuple[bool, str, Optional[str]]:
    """Änderungen der QS testen, committen und pushen.
    (in Ordnung, Hinweis für den Bericht, neuer Commit-SHA oder None)."""
    tracked, untracked = git_changes()
    tracked -= before_tracked
    untracked -= before_untracked
    stray = {p for p in tracked | untracked if not allowed(p)}
    if stray:
        log("Änderungen außerhalb des erlaubten Bereichs verworfen: " + ", ".join(sorted(stray)))
        revert(tracked & stray, untracked & stray)
        tracked -= stray
        untracked -= stray
    if not tracked and not untracked:
        return True, "", None

    rc, out = run([PY, "-m", "unittest", "discover", "-s", "tests"], TEST_TIMEOUT, cwd=SCRAPER)
    if rc != 0:
        revert(tracked, untracked)
        return False, "Korrekturen der QS verworfen, weil Tests fehlschlugen:\n" + out[-600:], None
    rc, out = run([PY, "-m", "regradar", "export-web"], TEST_TIMEOUT, cwd=SCRAPER)
    if rc != 0:
        revert(tracked | {"web/lib/live.json", "web/lib/sources.json"}, untracked)
        return False, "Korrekturen der QS verworfen, weil export-web fehlschlug:\n" + out[-600:], None

    tracked, untracked = git_changes()
    paths = sorted(p for p in (tracked - before_tracked) | (untracked - before_untracked) if allowed(p))
    msg = subject or "Newsletter-QS {}: Korrekturen vor der Freigabe\n\nAutomatisch nach scraper/NEWSLETTER_QA.md.".format(
        dt.date.today().strftime("%d.%m.%Y"))
    for cmd in (["git", "add", "--"] + paths, ["git", "commit", "-m", msg], ["git", "push", "origin", "main"]):
        rc, out = run(cmd, 120)
        if rc != 0:
            return False, "Korrekturen konnten nicht veröffentlicht werden ({}): {}".format(cmd[1], out[-300:]), None
    _, sha = run(["git", "rev-parse", "HEAD"], 30)
    return True, "", sha.strip()


def wait_for_deploy(sha: str) -> bool:
    deadline = time.time() + DEPLOY_TIMEOUT
    while time.time() < deadline:
        time.sleep(30)
        try:
            if (api("GET").get("commit") or "") == sha:
                return True
        except RuntimeError as e:
            log("Deploy-Abfrage fehlgeschlagen: {}".format(e))
    return False


def main(argv: List[str]) -> int:
    _load_env()
    now = dt.datetime.now(dt.timezone.utc)
    slot = current_slot(now).isoformat().replace("+00:00", ".000Z")
    force = "--force" in argv
    state = load_state()
    if state.get("slot") != slot:
        state = {"slot": slot, "attempts": 0, "done": False}
    if state.get("done") and not force:
        return 0

    info = api("GET")
    if info.get("slot") != slot:
        log("Slot weicht ab (Website {}, lokal {}), Abbruch".format(info.get("slot"), slot))
        return 1
    pending = info.get("pending") or []
    if "--dry" in argv:
        print(json.dumps(pending, ensure_ascii=False, indent=2))
        return 0
    if info.get("qa") and not force:
        state["done"] = True
        save_state(state)
        return 0

    if not pending:
        api("POST", {"ok": True, "report": "Keine fälligen Meldungen in dieser Woche.", "checked": []})
        state["done"] = True
        save_state(state)
        log("keine fälligen Meldungen")
        return 0

    before_tracked, before_untracked = git_changes()
    check_only = bool(before_tracked)
    state["attempts"] = state.get("attempts", 0) + 1
    save_state(state)

    ok_run, ok, report, detail = run_claude(pending, check_only)
    if not ok_run:
        log(detail)
        revert(*(s - b for s, b in zip(git_changes(), (before_tracked, before_untracked))))
        if state["attempts"] < MAX_ATTEMPTS:
            log("zweiter Versuch im nächsten Stundenlauf")
            return 1
        report = "Automatische QS konnte nicht laufen ({} Versuche). Bitte die Meldungen vor der Freigabe selbst prüfen.\n{}".format(
            state["attempts"], detail[:500])

    commit = info.get("commit")
    if ok_run and not check_only:
        applied, note, sha = apply_changes(before_tracked, before_untracked)
        if note:
            report += "\n\n" + note
        ok = ok and applied
        if sha:
            log("Korrekturen gepusht ({}), warte auf Deploy …".format(sha[:8]))
            if wait_for_deploy(sha):
                commit = sha
            else:
                ok = False
                report += "\n\nDeploy der Korrekturen nach 20 Min. noch nicht live, die Vorschau zeigt evtl. den alten Stand."
    elif check_only:
        report = "Nur geprüft, nichts geändert: Das Arbeitsverzeichnis hatte uncommittete Änderungen.\n" + report

    latest = api("GET")
    checked = [p["slug"] for p in latest.get("pending") or []]
    res = api("POST", {"ok": ok, "report": report, "checked": checked, "commit": commit})
    state["done"] = True
    save_state(state)
    log("Ergebnis gemeldet (ok={}), Antwort: {}".format(ok, json.dumps(res.get("report") or res)[:300]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except RuntimeError as e:
        log("Fehler: {}".format(e))
        sys.exit(1)
