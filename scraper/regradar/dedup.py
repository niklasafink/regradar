"""Dubletten-Erkennung über alle Bestände (Dokumente + Big4-Artikel).

Dieselbe Meldung erreicht den Scraper mehrfach: Joint Press Releases laufen
über die RSS-Feeds mehrerer Behörden (EBA/ESMA/EIOPA), Portale
veröffentlichen Beiträge unter neuer URL erneut (KPMG "…-2/"-Slugs),
Bundesgesetzblatt-Einträge erscheinen doppelt am selben Tag. Gelöscht wird
nichts — Dubletten werden in `dedup_suppressed` unterdrückt (ein Löschen
würde beim nächsten Crawl neu einlaufen) und von Web-Export, Gap-Report
und Big4-Zuordnung ignoriert.

Klassifizierung in zwei Schweregrade:
  SICHER  → automatisch unterdrückt, keine Rückfrage:
            - Dokumente: identischer (normalisierter) Titel, Publikation
              höchstens AUTO_WINDOW_DAYS auseinander (Joint Releases,
              Same-Day-Doppel). Wiederkehrende Titel mit großem Abstand
              (BGBl-"Bekanntmachungen über den Geltungsbereich …") sind
              KEINE Dubletten und bleiben unangetastet.
            - Big4: gleiche Kanzlei + gleicher Titel binnen
              BIG4_AUTO_WINDOW_DAYS (Doppel-Posts unter neuem Slug).
  UNSICHER → nur per Mail gemeldet (einmal je Fall, Tabelle
            dedup_reported), Entscheidung liegt beim Betreiber: genau zwei
            Einträge mit gleichem Titel und größerem Abstand (bis 1 Jahr) —
            kann eine Neuveröffentlichung desselben Inhalts (Deloitte
            publiziert Alerts unter neuer URL erneut) oder ein
            eigenständiges Dokument sein. Titel, die regelmäßig
            wiederkehren (3+ Einträge, BGBl-Bekanntmachungen), gelten als
            eigenständig und werden nicht gemeldet.

Aufheben einer Unterdrückung: Zeile aus dedup_suppressed löschen und
export-web neu laufen lassen.
"""
import re
import sqlite3
from typing import Dict, List, Optional

from .db import utcnow

AUTO_WINDOW_DAYS = 7        # Dokumente: identischer Titel binnen 7 Tagen → sicher
BIG4_AUTO_WINDOW_DAYS = 30  # Big4: gleiche Firma + Titel binnen 30 Tagen → sicher
AMBIG_MAX_DAYS = 365        # unsichere Paare: höchstens 1 Jahr Abstand
RECURRING_SOURCES = {"bgbl"}  # Quellen mit legitim wiederkehrenden Titeln
MIN_TITLE_LEN = 15          # sehr kurze Titel ("Information") nie als Dublette werten


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS dedup_suppressed (
               kind         TEXT NOT NULL,      -- 'document' | 'big4'
               item_id      INTEGER NOT NULL,   -- document_id bzw. article_id
               canonical_id INTEGER NOT NULL,   -- behaltener Vertreter
               reason       TEXT NOT NULL,
               created_at   TEXT NOT NULL,
               PRIMARY KEY (kind, item_id)
           )""")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS dedup_reported (
               group_key   TEXT PRIMARY KEY,
               reported_at TEXT NOT NULL
           )""")
    conn.commit()


def _norm(title: Optional[str]) -> str:
    return re.sub(r"\W+", " ", (title or "").lower()).strip()


def _days_between(a: str, b: str) -> Optional[int]:
    from datetime import date
    try:
        ya, ma, da = int(a[:4]), int(a[5:7]), int(a[8:10])
        yb, mb, db_ = int(b[:4]), int(b[5:7]), int(b[8:10])
        return abs((date(yb, mb, db_) - date(ya, ma, da)).days)
    except (ValueError, IndexError):
        return None


def _clusters(rows: List[dict], window_days: int) -> List[List[dict]]:
    """Nach Datum sortierte Zeilen in Cluster teilen, deren Nachbarabstand
    höchstens window_days beträgt."""
    rows = sorted(rows, key=lambda r: r["date"] or "9999")
    clusters: List[List[dict]] = []
    for r in rows:
        if clusters and r["date"] and clusters[-1][-1]["date"]:
            gap = _days_between(clusters[-1][-1]["date"], r["date"])
            if gap is not None and gap <= window_days:
                clusters[-1].append(r)
                continue
        clusters.append([r])
    return clusters


def _doc_canonical(cluster: List[dict]) -> dict:
    """Vertreter wählen: echtes Publikationsdatum vor Fallback-Datum,
    dann längerer Teaser, dann älteste ID (stabil)."""
    return sorted(cluster, key=lambda r: (
        0 if r["has_pubdate"] else 1, -len(r["summary"] or ""), r["id"]))[0]


def _suppress(conn: sqlite3.Connection, kind: str, cluster: List[dict],
              canonical: dict, reason: str) -> int:
    now = utcnow()
    n = 0
    for r in cluster:
        if r["id"] == canonical["id"]:
            continue
        conn.execute(
            "INSERT OR REPLACE INTO dedup_suppressed VALUES (?,?,?,?,?)",
            (kind, r["id"], canonical["id"], reason, now))
        n += 1
    return n


def _document_rows(conn: sqlite3.Connection) -> Dict[str, List[dict]]:
    # NOISE-Dokumente (Einzelfall-Maßnahmen, Warnungen, Events …) erreichen
    # den Web-Export nie — Dubletten darunter sind keine Rückfrage an den
    # Betreiber wert und werden komplett ignoriert.
    from .webexport import NOISE
    groups: Dict[str, List[dict]] = {}
    for r in conn.execute(
            """SELECT d.document_id, d.title, d.summary, d.authority, d.source_id,
                      d.canonical_url, d.publication_date,
                      COALESCE(d.publication_date, substr(d.first_seen_at, 1, 10)) AS dt
               FROM documents d
               WHERE d.document_id NOT IN
                     (SELECT item_id FROM dedup_suppressed WHERE kind='document')"""):
        key = _norm(r["title"])
        if len(key) < MIN_TITLE_LEN:
            continue
        if NOISE.search("{} {}".format(r["title"] or "", r["summary"] or "")):
            continue
        groups.setdefault(key, []).append({
            "id": r["document_id"], "title": r["title"] or "",
            "summary": r["summary"], "authority": r["authority"] or "",
            "source": r["source_id"], "url": r["canonical_url"] or "",
            "date": r["dt"], "has_pubdate": bool(r["publication_date"]),
        })
    return {k: v for k, v in groups.items() if len(v) > 1}


def _big4_rows(conn: sqlite3.Connection) -> Dict[str, List[dict]]:
    groups: Dict[str, List[dict]] = {}
    for r in conn.execute(
            """SELECT article_id, firm, title, teaser, url, published
               FROM big4_articles
               WHERE article_id NOT IN
                     (SELECT item_id FROM dedup_suppressed WHERE kind='big4')"""):
        key = "{}|{}".format(r["firm"], _norm(r["title"]))
        if len(_norm(r["title"])) < MIN_TITLE_LEN:
            continue
        groups.setdefault(key, []).append({
            "id": r["article_id"], "title": r["title"] or "",
            "summary": r["teaser"], "authority": r["firm"],
            "source": r["firm"], "url": r["url"],
            "date": r["published"] or "", "has_pubdate": bool(r["published"]),
        })
    return {k: v for k, v in groups.items() if len(v) > 1}


def run(conn: sqlite3.Connection) -> dict:
    """Dubletten klassifizieren: sichere unterdrücken, unsichere sammeln.

    Rückgabe: {"auto": n, "manual": [Fälle, noch nie gemeldet]}. Der
    Mail-Versand der unsicheren Fälle läuft im Gap-Report mit (max. eine
    Mail pro Tag, gleiche Infrastruktur)."""
    ensure_tables(conn)
    auto = 0
    manual: List[dict] = []
    reported = {r["group_key"] for r in conn.execute(
        "SELECT group_key FROM dedup_reported")}

    for kind, groups, window in (
            ("document", _document_rows(conn), AUTO_WINDOW_DAYS),
            ("big4", _big4_rows(conn), BIG4_AUTO_WINDOW_DAYS)):
        for key, rows in groups.items():
            # Sicher: eng beieinanderliegende Cluster auf einen Vertreter
            # eindampfen (Joint Releases, Doppel-Posts unter neuem Slug).
            survivors = []
            for cluster in _clusters(rows, window):
                if len(cluster) > 1:
                    canonical = _doc_canonical(cluster)
                    span = _days_between(cluster[0]["date"], cluster[-1]["date"])
                    auto += _suppress(
                        conn, kind, cluster, canonical,
                        "gleicher Titel binnen {} Tag(en)".format(span))
                    survivors.append(canonical)
                else:
                    survivors.append(cluster[0])
            # Unsicher: genau zwei verbleibende Einträge mit moderatem
            # Abstand — mögliche Neuveröffentlichung, Entscheidung per Mail.
            # 3+ Einträge oder wiederkehrende Quellen (BGBl) sind legitime
            # Wiederholungstitel und werden nicht gemeldet.
            if len(survivors) != 2:
                continue
            if any(s["source"] in RECURRING_SOURCES for s in survivors):
                continue
            gap = _days_between(survivors[0]["date"], survivors[1]["date"])
            if gap is None or gap > AMBIG_MAX_DAYS:
                continue
            group_key = "{}:{}:{}".format(kind, key, survivors[0]["date"])
            if group_key in reported:
                continue
            manual.append({
                "group_key": group_key, "kind": kind,
                "titel": survivors[0]["title"],
                "eintraege": [{"id": s["id"],
                               "quelle": s["authority"] or s["source"],
                               "datum": s["date"], "url": s["url"]}
                              for s in survivors],
            })
    conn.commit()
    return {"auto": auto, "manual": manual}


def mark_reported(conn: sqlite3.Connection, cases: List[dict]) -> None:
    now = utcnow()
    for c in cases:
        conn.execute("INSERT OR REPLACE INTO dedup_reported VALUES (?,?)",
                     (c["group_key"], now))
    conn.commit()
