#!/usr/bin/env python3
"""Reparatur-Agent der Scraper-Überwachung (launchd com.regradar.repair, minütlich).

Holt offene Reparaturaufträge von der Website ab (GET /api/health/repair?pending=1),
arbeitet sie ab und meldet jeden Schritt zurück (POST /api/health/repair), sodass
/admin/health live zeigt, was gerade passiert:

  1. Zustand prüfen: Quelle bekannt und aktiv? launchd-Agent des Stundenlaufs
     geladen (sonst neu laden)? Läuft gerade ein Stundenlauf (dann warten)?
  2. Quelle erneut abrufen (python3 -m regradar run <id>).
  3. Schlägt das fehl: Fehleranalyse und Korrekturversuch mit Claude Code
     headless (claude -p, nur im scraper/-Verzeichnis, keine Commits, höchstens
     alle 6 h je Quelle), danach erneut abrufen.
  4. Stundenlauf nachholen (run_hourly.sh: Crawl, Export, Push, Deploy,
     Herzschlag) – damit die Website den neuen Stand zeigt.
  5. Ergebnis prüfen: letzter Erfolg der Quelle jünger als der Auftrag → behoben.

Auftrag "pipeline" (kein Lebenszeichen bzw. Pipeline-Schritt ausgefallen)
überspringt 2–3. Auth über CRON_SECRET aus web/.env.local (bzw. HEALTH_SECRET
in scraper/.env); optional HEALTH_APP_URL und HEALTH_CLAUDE_MODEL (Standard sonnet).
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
from typing import Callable, List, Optional, Tuple

SCRAPER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRAPER)

from regradar.cli import _load_env  # noqa: E402
from regradar.db import connect, utcnow  # noqa: E402
from regradar.health import _request, load_steps, secret  # noqa: E402
from regradar.registry import SOURCES  # noqa: E402

PY = "/usr/bin/python3"
RUN_LOCK = os.path.join(SCRAPER, "data", ".run.lock")
AGENT_LOCK = os.path.join(SCRAPER, "data", ".repair.lock")
CLAUDE_RATE_FILE = os.path.join(SCRAPER, "data", "health_claude.json")
HOURLY_LOG = os.path.join(SCRAPER, "logs", "scraper.log")
HOURLY_LABEL = "com.regradar.scraper"
HOURLY_PLIST = os.path.expanduser("~/Library/LaunchAgents/com.regradar.scraper.plist")

RUN_TIMEOUT = 15 * 60
HOURLY_TIMEOUT = 50 * 60
CLAUDE_TIMEOUT = 25 * 60
CLAUDE_MIN_INTERVAL_S = 6 * 3600
WAIT_FOR_LOCK_S = 25 * 60
DETAIL_MAX = 2000

CLAUDE_ALLOWED_TOOLS = (
    "Read,Grep,Glob,Edit,Write,"
    "Bash(python3 *),Bash(/usr/bin/python3 *),Bash(curl *),"
    "Bash(git diff *),Bash(git status *),Bash(git log *)"
)


def log(msg: str) -> None:
    print("[{}] {}".format(time.strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


def _trim(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    text = text.strip()
    return text if len(text) <= DETAIL_MAX else "…" + text[-DETAIL_MAX:]


# ---------------------------------------------------------------- Reporter

class Reporter:
    """Schritte sammeln und (gedrosselt) an die Website melden."""

    def __init__(self, source: str, label: str, steps: Optional[List[dict]] = None):
        self.source = source
        self.label = label
        self.steps: List[dict] = list(steps or [])
        self.status = "running"
        self._last_post = 0.0

    def _post(self, force: bool = False, result: Optional[str] = None) -> None:
        now = time.time()
        if not force and now - self._last_post < 3:
            return
        self._last_post = now
        body = {"source": self.source, "label": self.label,
                "status": self.status, "steps": self.steps[-60:]}
        if result is not None:
            body["result"] = result
        _, err = _request("POST", "/api/health/repair", body)
        if err:
            log("Fortschritt nicht gemeldet: " + err)

    def start(self, title: str, detail: Optional[str] = None) -> None:
        self.steps.append({"at": utcnow(), "title": title, "status": "running",
                           "detail": _trim(detail)})
        self._post(force=True)

    def detail(self, text: str) -> None:
        if self.steps:
            self.steps[-1]["detail"] = _trim(text)
        self._post()

    def _end(self, status: str, detail: Optional[str]) -> None:
        if self.steps:
            self.steps[-1]["status"] = status
            if detail is not None:
                self.steps[-1]["detail"] = _trim(detail)
        self._post(force=True)

    def ok(self, detail: Optional[str] = None) -> None:
        self._end("ok", detail)

    def fail(self, detail: Optional[str] = None) -> None:
        self._end("failed", detail)

    def info(self, title: str, detail: Optional[str] = None) -> None:
        self.steps.append({"at": utcnow(), "title": title, "status": "info",
                           "detail": _trim(detail)})
        self._post(force=True)

    def finish(self, status: str, result: str) -> None:
        self.status = status
        self._post(force=True, result=result)


# ---------------------------------------------------------------- Helfer

def run_cmd(cmd: List[str], timeout: int, cwd: str = SCRAPER,
            on_line: Optional[Callable[[str], None]] = None,
            env: Optional[dict] = None) -> Tuple[int, str]:
    """Kommando mit Timeout ausführen; Ausgabe zeilenweise an on_line."""
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, env=env, bufsize=1)
    lines: List[str] = []

    def reader() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            lines.append(line.rstrip("\n"))

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    deadline = time.time() + timeout
    seen = 0
    while True:
        if on_line and len(lines) > seen:
            for l in lines[seen:]:
                on_line(l)
            seen = len(lines)
        if proc.poll() is not None and not t.is_alive():
            break
        if time.time() > deadline:
            proc.kill()
            lines.append("[Timeout nach {} Min. abgebrochen]".format(timeout // 60))
            break
        time.sleep(0.5)
    t.join(timeout=5)
    if on_line and len(lines) > seen:
        for l in lines[seen:]:
            on_line(l)
    rc = proc.returncode if proc.returncode is not None else -9
    return rc, "\n".join(lines)


def hourly_running() -> bool:
    return os.path.isdir(RUN_LOCK) and time.time() - os.path.getmtime(RUN_LOCK) < 120 * 60


def wait_for_hourly(rep: Reporter) -> None:
    if not hourly_running():
        return
    rep.start("Warten auf den laufenden Stundenlauf")
    t0 = time.time()
    while hourly_running() and time.time() - t0 < WAIT_FOR_LOCK_S:
        rep.detail("Stundenlauf aktiv seit {} Min., warte …".format(
            int((time.time() - os.path.getmtime(RUN_LOCK)) / 60)))
        time.sleep(15)
    rep.ok("Stundenlauf beendet." if not hourly_running() else "Sperre weiterhin aktiv – fahre trotzdem fort.")


def check_launchd() -> str:
    uid = os.getuid()
    rc, out = run_cmd(["launchctl", "print", "gui/{}/{}".format(uid, HOURLY_LABEL)], 30)
    if rc != 0:
        if os.path.exists(HOURLY_PLIST):
            rc2, out2 = run_cmd(["launchctl", "bootstrap", "gui/{}".format(uid), HOURLY_PLIST], 30)
            return "launchd-Agent {} war NICHT geladen – neu geladen: {}".format(
                HOURLY_LABEL, "OK" if rc2 == 0 else "fehlgeschlagen (" + out2[-200:] + ")")
        return "launchd-Agent {} nicht geladen und Plist fehlt ({}).".format(HOURLY_LABEL, HOURLY_PLIST)
    exit_m = re.search(r"last exit code = (\S+)", out)
    runs_m = re.search(r"runs = (\d+)", out)
    return "launchd-Agent {} geladen (Läufe {}, letzter Exit-Code {}).".format(
        HOURLY_LABEL, runs_m.group(1) if runs_m else "?", exit_m.group(1) if exit_m else "?")


def source_row(sid: str) -> Tuple[Optional[dict], List[dict]]:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT last_success_at, last_document_at FROM sources WHERE source_id=?", (sid,)).fetchone()
        errs = conn.execute(
            """SELECT started_at, error_message FROM crawl_runs
               WHERE source_id=? AND status='ERROR' ORDER BY run_id DESC LIMIT 3""", (sid,)).fetchall()
        return (dict(row) if row else None), [dict(e) for e in errs]
    finally:
        conn.close()


# ---------------------------------------------------------------- Schritte

def crawl_once(sid: str, rep: Reporter, title: str = "Quelle erneut abrufen") -> Tuple[bool, str]:
    rep.start(title, "python3 -m regradar run {}".format(sid))
    rc, out = run_cmd([PY, "-m", "regradar", "run", sid], RUN_TIMEOUT)
    tail = "\n".join(out.splitlines()[-12:])
    ok = (rc == 0 and "FEHLER" not in out and "Traceback" not in out
          and re.search(r"^{}\s+OK\b".format(re.escape(sid)), out, re.MULTILINE) is not None)
    (rep.ok if ok else rep.fail)(tail)
    return ok, out


def _claude_rate_ok(sid: str) -> Tuple[bool, int]:
    try:
        with open(CLAUDE_RATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    last = float(data.get(sid, 0) or 0)
    age = time.time() - last
    if last and age < CLAUDE_MIN_INTERVAL_S:
        return False, int(age / 60)
    data[sid] = time.time()
    os.makedirs(os.path.dirname(CLAUDE_RATE_FILE), exist_ok=True)
    with open(CLAUDE_RATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return True, 0


def claude_fix(sid: str, src: dict, run_output: str, errs: List[dict], rep: Reporter) -> bool:
    rep.start("Fehleranalyse und Korrekturversuch mit Claude Code")
    exe = shutil.which("claude") or ("/usr/local/bin/claude" if os.path.exists("/usr/local/bin/claude") else None)
    if not exe:
        rep.fail("Claude Code (claude) ist auf dem Rechner nicht installiert – Schritt übersprungen.")
        return False
    allowed, minutes = _claude_rate_ok(sid)
    if not allowed:
        rep.fail("Letzter Claude-Versuch für diese Quelle vor {} Min.; frühestens alle 6 Stunden "
                 "erneut (Kostenbremse). Bis dahin manuell prüfen.".format(minutes))
        return False
    err_lines = "\n".join("- {}: {}".format(e["started_at"], (e["error_message"] or "")[:300]) for e in errs) or "- keine"
    prompt = (
        "Du arbeitest im Verzeichnis scraper/ des Projekts Regulatory Radar (Python 3.9, keine "
        "externen Abhängigkeiten). Die Quelle '{sid}' ({name}, Adapter '{adapter}', Feed {url}) "
        "schlägt beim Crawl fehl.\n\n"
        "Ausgabe von `python3 -m regradar run {sid}`:\n```\n{out}\n```\n\n"
        "Letzte Fehler aus crawl_runs:\n{errs}\n\n"
        "Aufgabe: Ursache finden und beheben – typische Ursachen sind eine umgezogene Feed-/"
        "Sitemap-URL, geändertes HTML/JSON der Quelle, neue Header-/Zertifikatsanforderungen "
        "oder ein Bug im Adapter (regradar/adapters/) bzw. in regradar/registry.py. Prüfe die "
        "Live-Quelle bei Bedarf mit curl. Führe danach `python3 -m regradar run {sid}` erneut "
        "aus, bis der Lauf ohne FEHLER und mit Status OK endet, und lasse "
        "`python3 -m unittest discover -s tests` laufen. Regeln: keine Commits, keine Pushes, "
        "keine Änderungen außerhalb von scraper/, keine Quelle deaktivieren, keine Datenbank-"
        "Datei löschen. Ist die Quelle dauerhaft offline oder eine Behebung nicht möglich, "
        "erkläre das. Antworte am Ende mit einer kurzen deutschen Zusammenfassung (max. 5 "
        "Sätze): Ursache, Änderung, Ergebnis."
    ).format(sid=sid, name=src.get("name"), adapter=src.get("adapter"),
             url=src.get("discovery_url"), out=run_output[-3000:], errs=err_lines)
    model = os.environ.get("HEALTH_CLAUDE_MODEL", "sonnet")
    cmd = [exe, "-p", prompt, "--output-format", "json", "--permission-mode", "acceptEdits",
           "--allowedTools", CLAUDE_ALLOWED_TOOLS, "--max-turns", "60",
           "--no-session-persistence", "--model", model]
    env = dict(os.environ)
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin:" + env.get("PATH", "")
    rep.detail("claude -p läuft (Modell {}, max. 25 Min.) …".format(model))
    rc, out = run_cmd(cmd, CLAUDE_TIMEOUT, env=env)
    data: dict = {}
    for candidate in (out.strip(), out.strip().splitlines()[-1] if out.strip() else ""):
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                data = parsed
                break
        except ValueError:
            continue
    text = (data.get("result") or out[-1500:] or "(keine Ausgabe)").strip()
    cost = data.get("total_cost_usd")
    meta = "[{} Schritte{}]".format(
        data.get("num_turns", "?"),
        ", Kosten {:.2f} USD".format(cost) if isinstance(cost, (int, float)) else "")
    _, diff = run_cmd(["git", "diff", "--stat", "--", "."], 30)
    detail = "{}\n\n{}".format(text[:1600], meta)
    if diff.strip():
        detail += "\nGeänderte Dateien (nicht committet, bitte prüfen):\n" + diff.strip()[-600:]
    if rc != 0 or data.get("is_error"):
        rep.fail(detail)
        return False
    rep.ok(detail)
    return True


def run_hourly(rep: Reporter) -> bool:
    rep.start("Stundenlauf nachholen (Crawl, Export, Push, Deploy)", "Dauert etwa 10 Minuten …")
    interesting: List[str] = []

    def on_line(l: str) -> None:
        if (l.startswith("→ ") or l.startswith("Schritt") or l.startswith("Web-Export")
                or l.startswith("Big4:") or l.startswith("Dedup:") or "Push" in l
                or "Keine inhaltlichen" in l or l.startswith("Heartbeat") or "übersprungen" in l):
            interesting.append(l)
            rep.detail("Aktuell: " + l[:200])

    out = ""
    for attempt in (1, 2):
        rc, out = run_cmd(["/bin/zsh", os.path.join(SCRAPER, "run_hourly.sh")], HOURLY_TIMEOUT, on_line=on_line)
        try:
            with open(HOURLY_LOG, "a", encoding="utf-8") as f:
                f.write(out + "\n")
        except OSError:
            pass
        if "Lauf übersprungen" in out and attempt == 1:
            wait_for_hourly(rep)
            rep.start("Stundenlauf nachholen (zweiter Versuch)")
            continue
        break
    export_ok = "Web-Export:" in out
    summary = "\n".join(l for l in interesting if not l.startswith("→ "))[-1500:]
    (rep.ok if export_ok else rep.fail)(summary or out[-800:])
    return export_ok


# ---------------------------------------------------------------- Aufträge

def repair_source(sid: str, rep: Reporter, requested_at: str) -> Tuple[str, str]:
    src = next((s for s in SOURCES if s["source_id"] == sid), None)
    rep.start("Zustand prüfen")
    if not src:
        rep.fail("Quelle '{}' ist in regradar/registry.py unbekannt.".format(sid))
        return "failed", "Unbekannte Quelle – nichts zu reparieren."
    if not src.get("enabled", 1):
        rep.fail("Quelle ist deaktiviert (enabled=0 in regradar/registry.py). Keine automatische "
                 "Reparatur; zum Reaktivieren Feed-URL prüfen und enabled=1 setzen.")
        return "failed", "{} ist bewusst deaktiviert.".format(src["name"])
    row, errs = source_row(sid)
    lines = ["{} (Adapter {}, Feed {})".format(src["name"], src["adapter"], src.get("discovery_url")),
             "Letzter Erfolg: {}".format((row or {}).get("last_success_at") or "nie"),
             "Letztes Dokument: {}".format((row or {}).get("last_document_at") or "nie")]
    lines += ["Fehler {}: {}".format(e["started_at"], (e["error_message"] or "")[:200]) for e in errs]
    lines.append(check_launchd())
    rep.ok("\n".join(lines))

    wait_for_hourly(rep)
    ok, out = crawl_once(sid, rep)
    if not ok and claude_fix(sid, src, out, errs, rep):
        ok, out = crawl_once(sid, rep, "Quelle erneut abrufen (nach Korrektur)")
    if not ok:
        return "failed", ("{} ließ sich nicht automatisch reparieren – Feed-URL bzw. Adapter "
                          "manuell prüfen (Details in den Schritten).".format(src["name"]))
    run_hourly(rep)

    rep.start("Ergebnis prüfen")
    row, _ = source_row(sid)
    last = (row or {}).get("last_success_at") or ""
    if last and last >= requested_at[:19]:
        rep.ok("Letzter erfolgreicher Abruf: {}".format(last))
        return "done", "{} läuft wieder (letzter Erfolg {}).".format(src["name"], last)
    rep.fail("Kein erfolgreicher Abruf seit dem Auftrag ({}).".format(requested_at))
    return "failed", "{}: Abruf lief, aber die Datenbank verzeichnet keinen neuen Erfolg.".format(src["name"])


def repair_pipeline(rep: Reporter, requested_at: str) -> Tuple[str, str]:
    rep.start("Zustand prüfen")
    steps = load_steps()
    lines = [check_launchd()]
    run = steps.get("run") or {}
    if run:
        lines.append("Letzter Stundenlauf: {} bis {}, Exit-Code {}, Schritte {}".format(
            run.get("startedAt"), run.get("finishedAt"), run.get("exitCode"),
            ", ".join("{}={}".format(k, v) for k, v in (run.get("steps") or {}).items()) or "–"))
    lines.append("Stundenlauf gerade aktiv: {}".format("ja" if hourly_running() else "nein"))
    rep.ok("\n".join(lines))
    wait_for_hourly(rep)
    ok = run_hourly(rep)
    rep.start("Ergebnis prüfen")
    last = (load_steps().get("lastOk") or {}).get("export") or ""
    if ok and last and last >= requested_at[:19]:
        rep.ok("Export erfolgreich um {}.".format(last))
        return "done", "Stundenlauf erfolgreich nachgeholt, Website aktualisiert."
    rep.fail("Export nicht erfolgreich (letzter Erfolg {}).".format(last or "nie"))
    return "failed", "Der Stundenlauf ist erneut fehlgeschlagen – Log unter scraper/logs/scraper.log prüfen."


# ---------------------------------------------------------------- Main

def acquire_agent_lock() -> bool:
    try:
        os.makedirs(os.path.dirname(AGENT_LOCK), exist_ok=True)
        os.mkdir(AGENT_LOCK)
        return True
    except FileExistsError:
        if time.time() - os.path.getmtime(AGENT_LOCK) > 90 * 60:
            shutil.rmtree(AGENT_LOCK, ignore_errors=True)
            try:
                os.mkdir(AGENT_LOCK)
                return True
            except FileExistsError:
                return False
        return False


def main() -> int:
    _load_env()
    if not secret():
        return 0
    if not acquire_agent_lock():
        return 0
    try:
        resp, err = _request("GET", "/api/health/repair?pending=1")
        if err:
            log("Abfrage offener Aufträge fehlgeschlagen: " + err)
            return 0
        pending = (resp or {}).get("pending") or []
        if not pending:
            return 0
        for sid in pending:
            if not re.fullmatch(r"[a-z0-9_]{1,40}", sid):
                continue
            info = ((resp or {}).get("repairs") or {}).get(sid) or {}
            label = info.get("label") or sid
            requested_at = info.get("requestedAt") or utcnow()
            log("Reparaturauftrag: {} ({})".format(sid, label))
            rep = Reporter(sid, label, info.get("steps"))
            rep.info("Auftrag vom Rechner übernommen",
                     "{}, {}".format(socket.gethostname(), time.strftime("%d.%m.%Y %H:%M:%S")))
            try:
                if sid == "pipeline":
                    status, result = repair_pipeline(rep, requested_at)
                else:
                    status, result = repair_source(sid, rep, requested_at)
            except Exception as e:  # noqa: BLE001 – Agent darf nie ohne Rückmeldung sterben
                status, result = "failed", "Agent-Fehler: {}: {}".format(type(e).__name__, e)
                rep.info("Agent-Fehler", traceback.format_exc()[-1500:])
            rep.finish(status, result)
            log("Ergebnis {}: {} – {}".format(sid, status, result))
        return 0
    finally:
        shutil.rmtree(AGENT_LOCK, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
