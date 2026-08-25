"""Pipeline: discover → fetch → archive raw → normalize → change detection
→ documents/versions/sections → regulatory_events.

Idempotent: erneutes Ausführen erzeugt keine Dubletten (UNIQUE auf
source_id+external_id, Versionen nur bei geändertem normalized_sha256).
"""
import hashlib
import json
import os
import sqlite3
from typing import Optional

from . import http
from .adapters import ADAPTERS
from .db import utcnow
from .models import CanonicalDocument, DiscoveredDocument

RAW_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw")
MAX_FETCH_PER_RUN = 25   # Höflichkeitslimit pro Quelle und Lauf


def _store_raw(source_id: str, external_id: str, content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()
    subdir = os.path.join(RAW_DIR, source_id)
    os.makedirs(subdir, exist_ok=True)
    path = os.path.join(subdir, digest[:32])
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(content)
    return path


def _normalized_hash(doc: CanonicalDocument) -> str:
    basis = json.dumps({
        "title": doc.title,
        "status": doc.status,
        "publication_date": doc.publication_date,
        "consultation_deadline": doc.consultation_deadline,
        "full_text": doc.full_text,
    }, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def run_source(conn: sqlite3.Connection, source_id: str, since: Optional[str] = None,
               fetch_content: bool = True, verbose: bool = True) -> dict:
    row = conn.execute("SELECT * FROM sources WHERE source_id=?", (source_id,)).fetchone()
    if row is None:
        raise ValueError("Unbekannte Quelle: " + source_id)
    source = dict(row)
    if not source["enabled"]:
        return {"source_id": source_id, "status": "DISABLED"}

    adapter_cls = ADAPTERS[source["adapter"]]
    adapter = adapter_cls(source)

    run_id = conn.execute(
        "INSERT INTO crawl_runs (source_id, started_at, status) VALUES (?, ?, 'RUNNING')",
        (source_id, utcnow()),
    ).lastrowid
    conn.commit()

    stats = {"source_id": source_id, "discovered": 0, "fetched": 0, "new": 0,
             "changed": 0, "http_errors": 0, "parse_errors": 0, "status": "OK",
             "error": None}
    try:
        candidates = adapter.discover(since=since)
    except Exception as e:
        stats["status"] = "ERROR"
        stats["error"] = str(e)
        conn.execute(
            "UPDATE crawl_runs SET finished_at=?, status='ERROR', error_message=? WHERE run_id=?",
            (utcnow(), str(e), run_id))
        conn.execute("UPDATE sources SET last_checked_at=? WHERE source_id=?", (utcnow(), source_id))
        conn.commit()
        return stats

    stats["discovered"] = len(candidates)
    fetch_budget = MAX_FETCH_PER_RUN

    for cand in candidates:
        try:
            known = conn.execute(
                "SELECT document_id, current_version FROM documents WHERE source_id=? AND external_id=?",
                (source_id, cand.external_id)).fetchone()

            raw_content = None
            raw_sha = None
            raw_path = None
            fetch_url = adapter.fetch_url(cand) if fetch_content else None
            if fetch_url and fetch_budget > 0:
                # Bei bekannten Dokumenten Conditional GET über gespeicherte Header
                prev = conn.execute(
                    "SELECT etag, last_modified, raw_sha256 FROM raw_documents "
                    "WHERE source_id=? AND external_id=? ORDER BY raw_id DESC LIMIT 1",
                    (source_id, cand.external_id)).fetchone()
                result, err = http.get(
                    fetch_url,
                    etag=prev["etag"] if prev else None,
                    last_modified=prev["last_modified"] if prev else None)
                fetch_budget -= 1
                if err or result is None:
                    stats["http_errors"] += 1
                elif result.status == 304:
                    pass  # unverändert, kein neues Raw
                elif result.status == 200:
                    stats["fetched"] += 1
                    raw_content = result.content
                    raw_sha = result.sha256
                    if prev and prev["raw_sha256"] == raw_sha:
                        raw_path = None  # identisch, kein neues Archiv nötig
                    else:
                        raw_path = _store_raw(source_id, cand.external_id, raw_content)
                        conn.execute(
                            """INSERT INTO raw_documents (source_id, external_id, retrieved_at,
                                   source_url, http_status, content_type, etag, last_modified,
                                   raw_sha256, raw_storage_path)
                               VALUES (?,?,?,?,?,?,?,?,?,?)""",
                            (source_id, cand.external_id, utcnow(), fetch_url, result.status,
                             result.content_type, result.etag, result.last_modified,
                             raw_sha, raw_path))
                else:
                    stats["http_errors"] += 1

            try:
                doc = adapter.normalize(cand, raw_content)
            except Exception:
                stats["parse_errors"] += 1
                from .adapters.base import SourceAdapter
                doc = SourceAdapter.normalize(adapter, cand, None)
            doc.raw_sha256 = raw_sha
            doc.normalized_sha256 = _normalized_hash(doc)

            if known is None:
                _insert_document(conn, doc, event_type="DOCUMENT_PUBLISHED")
                stats["new"] += 1
            else:
                last = conn.execute(
                    "SELECT normalized_sha256 FROM document_versions WHERE document_id=? "
                    "ORDER BY version DESC LIMIT 1", (known["document_id"],)).fetchone()
                if last is None or last["normalized_sha256"] != doc.normalized_sha256:
                    _add_version(conn, known["document_id"], known["current_version"] + 1, doc)
                    stats["changed"] += 1
            conn.commit()
        except Exception as e:
            stats["parse_errors"] += 1
            if verbose:
                print("  ! {}: {}".format(cand.external_id, e))
            conn.rollback()

    now = utcnow()
    conn.execute(
        """UPDATE crawl_runs SET finished_at=?, status=?, documents_discovered=?,
               documents_fetched=?, documents_new=?, documents_changed=?,
               http_errors=?, parse_errors=? WHERE run_id=?""",
        (now, stats["status"], stats["discovered"], stats["fetched"], stats["new"],
         stats["changed"], stats["http_errors"], stats["parse_errors"], run_id))
    conn.execute(
        "UPDATE sources SET last_checked_at=?, last_success_at=?, "
        "last_document_at=COALESCE((SELECT MAX(first_seen_at) FROM documents WHERE source_id=?), last_document_at) "
        "WHERE source_id=?", (now, now, source_id, source_id))
    conn.commit()
    return stats


def _insert_document(conn, doc: CanonicalDocument, event_type: str):
    now = utcnow()
    document_id = conn.execute(
        """INSERT INTO documents (source_id, external_id, authority, jurisdiction, title,
               document_type, status, language, publication_date, consultation_deadline,
               effective_from, canonical_url, reference_number, summary, document_urls,
               current_version, first_seen_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)""",
        (doc.source_id, doc.external_id, doc.authority, doc.jurisdiction, doc.title,
         doc.document_type, doc.status, doc.language, doc.publication_date,
         doc.consultation_deadline, doc.effective_from, doc.canonical_url,
         doc.reference_number, doc.summary, json.dumps(doc.document_urls), now),
    ).lastrowid
    _write_version(conn, document_id, 1, doc)
    conn.execute(
        """INSERT INTO regulatory_events (event_type, source_id, document_id, authority,
               title, published_at, deadline, status, payload, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (event_type, doc.source_id, document_id, doc.authority, doc.title,
         doc.publication_date, doc.consultation_deadline, doc.status,
         json.dumps({"document_type": doc.document_type, "url": doc.canonical_url,
                     "reference": doc.reference_number}, ensure_ascii=False), now))


def _add_version(conn, document_id: int, version: int, doc: CanonicalDocument):
    now = utcnow()
    _write_version(conn, document_id, version, doc)
    conn.execute(
        """UPDATE documents SET current_version=?, last_changed_at=?, title=?, status=?,
               publication_date=COALESCE(?, publication_date),
               consultation_deadline=COALESCE(?, consultation_deadline),
               summary=COALESCE(?, summary)
           WHERE document_id=?""",
        (version, now, doc.title, doc.status, doc.publication_date,
         doc.consultation_deadline, doc.summary, document_id))
    conn.execute(
        """INSERT INTO regulatory_events (event_type, source_id, document_id, authority,
               title, published_at, deadline, status, payload, created_at)
           VALUES ('DOCUMENT_UPDATED',?,?,?,?,?,?,?,?,?)""",
        (doc.source_id, document_id, doc.authority, doc.title, doc.publication_date,
         doc.consultation_deadline, doc.status,
         json.dumps({"new_version": version}, ensure_ascii=False), now))


def _write_version(conn, document_id: int, version: int, doc: CanonicalDocument):
    version_id = conn.execute(
        """INSERT INTO document_versions (document_id, version, raw_sha256,
               normalized_sha256, full_text, created_at)
           VALUES (?,?,?,?,?,?)""",
        (document_id, version, doc.raw_sha256, doc.normalized_sha256,
         doc.full_text, utcnow()),
    ).lastrowid
    for s in doc.sections:
        conn.execute(
            "INSERT INTO document_sections (version_id, section_id, label, text, sort_order) "
            "VALUES (?,?,?,?,?)",
            (version_id, s.section_id, s.label, s.text, s.order))
