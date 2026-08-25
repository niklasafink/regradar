"""SQLite-Persistenz. Schema so gehalten, dass eine spätere
PostgreSQL-Migration (gleiche Tabellennamen/Spalten) einfach ist."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Optional

DEFAULT_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "regradar.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
    source_id       TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    authority       TEXT NOT NULL,
    jurisdiction    TEXT NOT NULL,
    base_url        TEXT NOT NULL,
    discovery_url   TEXT,
    discovery_type  TEXT,               -- API | XML | RSS | SITEMAP | HTML
    access_class    TEXT DEFAULT 'PUBLIC',
    document_types  TEXT,               -- JSON-Liste
    poll_interval_minutes INTEGER DEFAULT 360,
    adapter         TEXT NOT NULL,
    enabled         INTEGER DEFAULT 1,
    last_checked_at TEXT,
    last_success_at TEXT,
    last_document_at TEXT
);

CREATE TABLE IF NOT EXISTS crawl_runs (
    run_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       TEXT NOT NULL REFERENCES sources(source_id),
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT,               -- OK | ERROR | PARTIAL
    documents_discovered INTEGER DEFAULT 0,
    documents_fetched    INTEGER DEFAULT 0,
    documents_new        INTEGER DEFAULT 0,
    documents_changed    INTEGER DEFAULT 0,
    http_errors          INTEGER DEFAULT 0,
    parse_errors         INTEGER DEFAULT 0,
    error_message   TEXT
);

CREATE TABLE IF NOT EXISTS raw_documents (
    raw_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       TEXT NOT NULL,
    external_id     TEXT NOT NULL,
    retrieved_at    TEXT NOT NULL,
    source_url      TEXT NOT NULL,
    http_status     INTEGER,
    content_type    TEXT,
    etag            TEXT,
    last_modified   TEXT,
    raw_sha256      TEXT NOT NULL,
    raw_storage_path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_ext ON raw_documents(source_id, external_id);

CREATE TABLE IF NOT EXISTS documents (
    document_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       TEXT NOT NULL REFERENCES sources(source_id),
    external_id     TEXT NOT NULL,
    authority       TEXT,
    jurisdiction    TEXT,
    title           TEXT NOT NULL,
    document_type   TEXT NOT NULL,
    status          TEXT,
    language        TEXT,
    publication_date TEXT,
    consultation_deadline TEXT,
    effective_from  TEXT,
    canonical_url   TEXT,
    reference_number TEXT,
    summary         TEXT,
    document_urls   TEXT,               -- JSON-Liste
    current_version INTEGER DEFAULT 1,
    first_seen_at   TEXT NOT NULL,
    last_changed_at TEXT,
    UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS document_versions (
    version_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES documents(document_id),
    version         INTEGER NOT NULL,
    raw_sha256      TEXT,
    normalized_sha256 TEXT,
    full_text       TEXT,
    created_at      TEXT NOT NULL,
    UNIQUE(document_id, version)
);

CREATE TABLE IF NOT EXISTS document_sections (
    section_pk      INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id      INTEGER NOT NULL REFERENCES document_versions(version_id),
    section_id      TEXT NOT NULL,
    label           TEXT,
    text            TEXT,
    sort_order      INTEGER
);

CREATE TABLE IF NOT EXISTS regulatory_events (
    event_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type      TEXT NOT NULL,      -- DOCUMENT_PUBLISHED | DOCUMENT_UPDATED | ...
    source_id       TEXT NOT NULL,
    document_id     INTEGER REFERENCES documents(document_id),
    authority       TEXT,
    title           TEXT,
    published_at    TEXT,
    deadline        TEXT,
    status          TEXT,
    payload         TEXT,               -- JSON (change_summary, evidence …)
    created_at      TEXT NOT NULL
);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


def upsert_source(conn: sqlite3.Connection, s: dict) -> None:
    conn.execute(
        """INSERT INTO sources (source_id, name, authority, jurisdiction, base_url,
               discovery_url, discovery_type, access_class, document_types,
               poll_interval_minutes, adapter, enabled)
           VALUES (:source_id, :name, :authority, :jurisdiction, :base_url,
               :discovery_url, :discovery_type, :access_class, :document_types,
               :poll_interval_minutes, :adapter, :enabled)
           ON CONFLICT(source_id) DO UPDATE SET
               name=excluded.name, authority=excluded.authority,
               jurisdiction=excluded.jurisdiction, base_url=excluded.base_url,
               discovery_url=excluded.discovery_url, discovery_type=excluded.discovery_type,
               access_class=excluded.access_class, document_types=excluded.document_types,
               poll_interval_minutes=excluded.poll_interval_minutes,
               adapter=excluded.adapter""",
        {**s, "document_types": json.dumps(s.get("document_types", []))},
    )
    conn.commit()
