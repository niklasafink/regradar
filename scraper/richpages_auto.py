#!/usr/bin/env python3
"""Stundenlauf: neue Meldungen automatisch als angereicherte Detailseite.

Holt aus der Live-Sitemap alle /u/-Seiten ab CUTOFF, die noch nicht in
web/lib/rich.json stehen, und erzeugt je Meldung die Felder mit genau einem
Aufruf von claude -p (Sonnet, Claude-Abo-Kontingent: ANTHROPIC_*-Variablen
werden entfernt, keine API-Kosten). Ziel höchstens 20.000 Tokens je Meldung
(Quelltext auf 12.000 Zeichen gekürzt, ohne Thinking und Werkzeuge).
Grenzen: MAX_PER_RUN je Lauf, MAX_PER_DAY je Kalendertag. Danach Commit und
Push nur von web/lib/rich.json; Vercel deployt automatisch.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.request

os.environ.setdefault("RICH_SRC_CHARS", "12000")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import richpages as rp  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
RICH = os.path.join(REPO, "web", "lib", "rich.json")
STATE = os.path.join(HERE, "data", "rich_state.json")
CUTOFF = os.environ.get("RICH_CUTOFF", "2026-11-07")
MAX_PER_RUN = int(os.environ.get("RICH_MAX_PER_RUN", "5"))
MAX_PER_DAY = int(os.environ.get("RICH_MAX_PER_DAY", "40"))
TOKEN_BUDGET = 20000
MAX_ATTEMPTS = 2


def log(msg):
    print(f"[richpages] {msg}", flush=True)


def sitemap_slugs():
    req = urllib.request.Request(rp.BASE + "/sitemap.xml", headers={"User-Agent": rp.UA})
    xml = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "ignore")
    out = []
    for slug in re.findall(r"<loc>https://www\.regradar\.de/u/([^<]+)</loc>", xml):
        m = re.search(r"-(\d{4}-\d{2}-\d{2})-", slug)
        if m and m.group(1) >= CUTOFF:
            out.append((m.group(1), slug))
    return [s for _, s in sorted(out, reverse=True)]


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:  # noqa: BLE001
        return default


def main():
    today = dt.date.today().isoformat()
    rich = load(RICH, {})
    state = load(STATE, {"days": {}, "attempts": {}, "tokens": {}})
    done_today = state["days"].get(today, 0)
    if done_today >= MAX_PER_DAY:
        log(f"Tageslimit {MAX_PER_DAY} erreicht, nichts zu tun")
        return 0
    try:
        todo = [s for s in sitemap_slugs() if s not in rich and state["attempts"].get(s, 0) < MAX_ATTEMPTS]
    except Exception as e:  # noqa: BLE001
        log(f"Sitemap nicht abrufbar: {e}")
        return 1
    todo = todo[: min(MAX_PER_RUN, MAX_PER_DAY - done_today)]
    if not todo:
        log("keine neuen Meldungen")
        return 0
    work = os.path.join(HERE, "data", "rich_work")
    added = 0
    for slug in todo:
        state["attempts"][slug] = state["attempts"].get(slug, 0) + 1
        try:
            wd = os.path.join(work, slug[:60])
            os.makedirs(wd, exist_ok=True)
            page = rp.extract_page(slug)
            source, note = rp.fetch_source(page["orig"], wd)
            data, usage = rp.run_model(page, source, note)
            dropped = rp.check(data, page, source)
        except Exception as e:  # noqa: BLE001
            log(f"FEHLER {slug}: {e}")
            continue
        state["tokens"][slug] = usage["total"]
        flag = "" if usage["total"] <= TOKEN_BUDGET else f" (über Budget {TOKEN_BUDGET})"
        log(f"ok {slug}: {usage['total']} Tokens{flag}, {len(dropped)} Daten verworfen, Quelle: {note}")
        rich[slug] = {**data, "meta": {"generated": today, "model": rp.MODEL, "source": note,
                                       "dropped": len(dropped), "tokens": usage["total"]}}
        added += 1
        state["days"][today] = state["days"].get(today, 0) + 1
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump(state, open(STATE, "w"), ensure_ascii=False, indent=1)
    if not added:
        return 0
    json.dump(dict(sorted(rich.items())), open(RICH, "w"), ensure_ascii=False, indent=1)
    msg = f"Detailseiten: {added} neue Meldung(en) angereichert ({today})"
    for cmd in (["git", "add", "web/lib/rich.json"], ["git", "commit", "-m", msg], ["git", "push", "origin", "main"]):
        r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
        if r.returncode != 0:
            log(f"{' '.join(cmd[:2])} fehlgeschlagen: {r.stderr.strip()[-300:]}")
            return 1
    log(f"{added} Seite(n) committet und gepusht")
    return 0


if __name__ == "__main__":
    sys.exit(main())
