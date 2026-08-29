"""CLI: python3 -m regradar <command>

Befehle:
  init                       Datenbank anlegen und Source Registry seeden
  sources                    Quellenübersicht mit Status
  run [source_id|all]        Quelle(n) crawlen (Discovery + Fetch + Persist)
  run --no-fetch …           nur Discovery/Metadaten, keine Inhalte laden
  report [N]                 die N neuesten Regulatory Events (Standard 25)
  export [pfad]              Events + Dokumente als JSON exportieren
  export-web [pfad]          Live-Updates für das Frontend (web/lib/live.json)
  big4                       Fachbeiträge der Big 4 (PwC, KPMG, Deloitte Legal
                             u. a.) einsammeln; Zuordnung läuft im export-web
  gap-report [--force]       Big4-Beiträge ohne gescrapte Primärquelle per
                             Mail melden (max. 1×/Tag; --force ignoriert das)
"""
import json
import os
import sys

from . import db as dbmod
from .pipeline import run_source
from .registry import SOURCES


def _print_table(rows, headers):
    if not rows:
        print("(keine Einträge)")
        return
    widths = [max(len(str(h)), max(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)]
    line = "  ".join(str(h).ljust(w) for h, w in zip(headers, widths))
    print(line)
    print("-" * len(line))
    for r in rows:
        print("  ".join(str(c).ljust(w) for c, w in zip(r, widths)))


def cmd_init(conn):
    for s in SOURCES:
        dbmod.upsert_source(conn, s)
    print("Datenbank initialisiert: {} Quellen registriert.".format(len(SOURCES)))


def cmd_sources(conn):
    rows = conn.execute(
        """SELECT s.source_id, s.name, s.discovery_type, s.enabled,
                  COALESCE(s.last_success_at,'–') AS last_ok,
                  (SELECT COUNT(*) FROM documents d WHERE d.source_id=s.source_id) AS docs
           FROM sources s ORDER BY s.source_id""").fetchall()
    _print_table(
        [(r["source_id"], r["name"][:34], r["discovery_type"],
          "an" if r["enabled"] else "aus", r["last_ok"][:16], r["docs"]) for r in rows],
        ["Quelle", "Name", "Zugriff", "Status", "Letzter Erfolg", "Dokumente"])


def cmd_run(conn, target: str, fetch: bool, since=None):
    ids = [s["source_id"] for s in SOURCES] if target == "all" else [target]
    results = []
    for sid in ids:
        print("→ {} …".format(sid), flush=True)
        stats = run_source(conn, sid, since=since, fetch_content=fetch)
        results.append(stats)
        if stats.get("error"):
            print("  FEHLER: {}".format(stats["error"]))
        else:
            print("  entdeckt {discovered}, geladen {fetched}, neu {new}, "
                  "geändert {changed}, HTTP-Fehler {http_errors}, Parse-Fehler {parse_errors}"
                  .format(**stats))
    print()
    _print_table(
        [(r["source_id"], r["status"], r.get("discovered", 0), r.get("new", 0),
          r.get("changed", 0)) for r in results],
        ["Quelle", "Status", "Entdeckt", "Neu", "Geändert"])


def cmd_report(conn, limit: int):
    rows = conn.execute(
        """SELECT e.created_at, e.event_type, e.authority, e.title, e.published_at,
                  COALESCE(e.deadline,'') AS deadline
           FROM regulatory_events e ORDER BY e.event_id DESC LIMIT ?""", (limit,)).fetchall()
    print("Neueste Regulatory Events")
    print("=" * 100)
    for r in rows:
        line = "[{}] {}  {}".format(
            r["published_at"] or r["created_at"][:10], r["authority"] or "?", r["event_type"])
        print(line)
        print("    {}".format((r["title"] or "")[:110]))
        if r["deadline"]:
            print("    Frist: {}".format(r["deadline"]))
    print("=" * 100)
    total = conn.execute("SELECT COUNT(*) c FROM regulatory_events").fetchone()["c"]
    print("{} Events insgesamt, {} angezeigt.".format(total, len(rows)))


def cmd_export(conn, path: str):
    docs = [dict(r) for r in conn.execute(
        """SELECT d.source_id, d.external_id, d.authority, d.jurisdiction, d.title,
                  d.document_type, d.status, d.language, d.publication_date,
                  d.consultation_deadline, d.canonical_url, d.reference_number,
                  d.summary, d.current_version, d.first_seen_at, d.last_changed_at
           FROM documents d ORDER BY d.first_seen_at DESC""").fetchall()]
    events = [dict(r) for r in conn.execute(
        """SELECT event_type, source_id, authority, title, published_at, deadline,
                  status, payload, created_at
           FROM regulatory_events ORDER BY event_id DESC""").fetchall()]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"documents": docs, "events": events}, f, ensure_ascii=False, indent=2)
    print("Export: {} Dokumente, {} Events → {}".format(len(docs), len(events), path))


def _load_env():
    """Lädt scraper/.env (KEY=VALUE-Zeilen) in os.environ, ohne bereits
    gesetzte Variablen zu überschreiben. Keine externe Abhängigkeit."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip("'\"")
            if key and value and key not in os.environ:
                os.environ[key] = value


def main(argv=None):
    _load_env()
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print(__doc__)
        return 1
    cmd = argv[0]
    conn = dbmod.connect()
    try:
        if cmd == "init":
            cmd_init(conn)
        elif cmd == "sources":
            cmd_sources(conn)
        elif cmd == "run":
            args = [a for a in argv[1:] if not a.startswith("--")]
            fetch = "--no-fetch" not in argv
            since = None
            for a in argv[1:]:
                if a.startswith("--since="):
                    since = a.split("=", 1)[1]
            cmd_init(conn)  # Registry immer aktuell halten (idempotent)
            cmd_run(conn, args[0] if args else "all", fetch, since)
        elif cmd == "report":
            cmd_report(conn, int(argv[1]) if len(argv) > 1 else 25)
        elif cmd == "export":
            cmd_export(conn, argv[1] if len(argv) > 1 else "data/export.json")
        elif cmd == "big4":
            from .big4 import scrape
            stats = scrape(conn)
            print("Big4: {pwc_blogs} PwC-Blog, {pwc_legal} PwC-Legal, {kpmg} KPMG, "
                  "{deloitte} Deloitte, {wvln} WvlN neu – {total} Artikel gesamt, "
                  "{framework_mapped} mit Rahmenwerk-Zuordnung".format(**stats))
        elif cmd == "gap-report":
            from .gapreport import run as gap_run
            info = gap_run(conn, force="--force" in argv)
            print("Gap-Report: {status}, {gaps} Lücke(n){extra}".format(
                status=info["status"], gaps=info["gaps"],
                extra=" in {} Themen (aus {} geprüften Artikeln)".format(
                    info["themen"], info["geprüft"]) if "themen" in info else ""))
        elif cmd == "export-web":
            from .webexport import export_web
            info = export_web(conn, argv[1] if len(argv) > 1 else None)
            print("Web-Export: {updates} Updates in {frameworks} Rahmenwerken, "
                  "{advisory} Big4-Verweise (aus {scanned} Dokumenten, "
                  "LLM-Filter {llm}) → {path}".format(**info))
        else:
            print(__doc__)
            return 1
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
