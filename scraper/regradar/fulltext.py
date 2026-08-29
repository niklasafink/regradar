"""Volltext-Abruf der Primärquelle für die LLM-Zusammenfassung.

Lädt die Original-Meldung (canonical_url) und extrahiert lesbaren Text:
HTML per Tag-Stripping (bevorzugt <main>/<article>), PDFs best effort über
FlateDecode-Streams (Standardbibliothek, keine externen Abhängigkeiten).
Ergebnisse werden pro Dokument in der SQLite-DB gecacht, damit der
stündliche Lauf jede Quelle nur einmal abruft.

Liefert die Extraktion nichts Brauchbares (z. B. gescannte PDFs oder
JavaScript-Seiten), fällt die Zusammenfassung auf den Teaser zurück.
"""
import html as html_mod
import re
import sqlite3
import zlib
from typing import Optional

from .http import get

# Auszugslänge für den LLM-Kontext: genug für den fachlichen Kern,
# ohne Anhänge/Fußnoten-Ballast mitzuschleppen.
MAX_CHARS = 8000
# Darunter gilt eine Extraktion als gescheitert (Navigationsreste o. Ä.).
MIN_CHARS = 300


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS doc_fulltext (
               document_id INTEGER PRIMARY KEY REFERENCES documents(document_id),
               url         TEXT NOT NULL,
               text        TEXT NOT NULL,
               fetched_at  TEXT NOT NULL
           )""")
    conn.commit()


def _html_text(raw: str) -> str:
    # Skripte, Styles und offensichtliches Seitengerüst entfernen.
    raw = re.sub(r"(?is)<(script|style|noscript|nav|header|footer|aside|form)\b.*?</\1>", " ", raw)
    raw = re.sub(r"(?is)<!--.*?-->", " ", raw)
    # Hauptinhalt bevorzugen, wenn die Seite ihn ausweist.
    for pat in (r"(?is)<main\b.*?</main>", r"(?is)<article\b.*?</article>",
                r'(?is)<div[^>]+(?:id|class)="[^"]*(?:content|main)[^"]*".*?</div>'):
        m = re.search(pat, raw)
        if m and len(m.group(0)) > 2000:
            raw = m.group(0)
            break
    # Blockgrenzen als Zeilenumbrüche erhalten, dann alle Tags entfernen.
    raw = re.sub(r"(?i)</(p|div|li|tr|h[1-6]|section|table)>|<br\s*/?>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = html_mod.unescape(raw)
    lines = [" ".join(l.split()) for l in raw.splitlines()]
    return "\n".join(l for l in lines if l)


def _pdf_escape(b: bytes) -> str:
    out = []
    i = 0
    while i < len(b):
        c = b[i]
        if c == 0x5C and i + 1 < len(b):  # Backslash-Escape
            n = b[i + 1]
            if n in b"nrtbf":
                out.append({0x6E: "\n", 0x72: "\r", 0x74: "\t",
                            0x62: "", 0x66: ""}[n])
                i += 2
                continue
            if 0x30 <= n <= 0x37:  # Oktal
                j = i + 1
                oct_digits = b""
                while j < len(b) and len(oct_digits) < 3 and 0x30 <= b[j] <= 0x37:
                    oct_digits += bytes([b[j]])
                    j += 1
                try:
                    out.append(chr(int(oct_digits, 8)))
                except ValueError:
                    pass
                i = j
                continue
            out.append(chr(n))
            i += 2
            continue
        out.append(chr(c))
        i += 1
    return "".join(out)


def _pdf_text(data: bytes) -> str:
    """Best-effort-Textextraktion: FlateDecode-Streams dekomprimieren und
    Literal-Strings der Textoperatoren (Tj/TJ/') einsammeln. Für PDFs mit
    CID-/Subset-Fonts entsteht Zeichensalat – das fängt der Plausibilitäts-
    check in fetch_fulltext ab."""
    chunks = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.DOTALL):
        raw = m.group(1)
        try:
            raw = zlib.decompress(raw)
        except zlib.error:
            continue
        if b"BT" not in raw:
            continue
        parts = []
        # Operatoren in Dokumentreihenfolge; Strings innerhalb eines
        # TJ-Arrays ohne Leerzeichen verketten (Kerning-Zahlen dazwischen
        # trennen Glyphengruppen, keine Wörter).
        for op in re.finditer(
                rb"\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|')"
                rb"|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ", raw, re.DOTALL):
            if op.group(1) is not None:
                parts.append(_pdf_escape(op.group(1)))
            else:
                parts.append(_pdf_escape(b"".join(re.findall(
                    rb"\(((?:[^()\\]|\\.)*)\)", op.group(2)))))
        if parts:
            chunks.append(" ".join(parts))
    text = "\n".join(chunks)
    return " ".join(text.split())


def _plausible(text: str) -> bool:
    if len(text) < MIN_CHARS:
        return False
    letters = sum(c.isalpha() or c.isspace() for c in text)
    return letters / len(text) > 0.75


def _linked_pdf(base_url: str, raw_html: str) -> Optional[str]:
    """Erster PDF-Link der Seite (für dünne Dokumentseiten à la ESMA,
    die nur Metadaten zeigen und den Inhalt als PDF verlinken)."""
    # href auch unquoted matchen (ESMA rendert <a href=/sites/....pdf class=…>).
    m = re.search(r'href=["\']?([^"\'\s>]+\.pdf[^"\'\s>]*)', raw_html, re.IGNORECASE)
    if not m:
        return None
    from urllib.parse import urljoin
    return urljoin(base_url, html_mod.unescape(m.group(1)))


def fetch_fulltext(conn: sqlite3.Connection, document_id: int,
                   url: Optional[str]) -> str:
    """Gecachter Volltext-Auszug der Original-Meldung ('' wenn nicht
    verfügbar). Fehlschläge werden als leerer Text gecacht, damit tote
    Links nicht bei jedem Lauf erneut abgerufen werden."""
    if not url:
        return ""
    _ensure_table(conn)
    row = conn.execute(
        "SELECT text FROM doc_fulltext WHERE document_id=?",
        (document_id,)).fetchone()
    if row is not None:
        return row[0]

    text = ""
    result, err = get(url)
    if result and result.status == 200:
        ct = result.content_type
        if "pdf" in ct or url.lower().endswith(".pdf") or result.content[:5] == b"%PDF-":
            text = _pdf_text(result.content)
        else:
            raw = result.text()
            text = _html_text(raw)
            # Dünne Dokumentseiten (nur Metadaten, Inhalt als PDF verlinkt,
            # z. B. ESMA): das verlinkte PDF nachladen und Text anhängen.
            if len(text) < 1500:
                pdf_url = _linked_pdf(result.url, raw)
                if pdf_url:
                    pdf_res, _ = get(pdf_url)
                    if pdf_res and pdf_res.status == 200:
                        pdf_text = _pdf_text(pdf_res.content)
                        if _plausible(pdf_text):
                            text = "{}\n{}".format(text, pdf_text).strip()
        if not _plausible(text):
            text = ""
        text = text[:MAX_CHARS]
    elif err:
        print("Volltext: {} ({})".format(err, url))

    from .db import utcnow
    conn.execute(
        "INSERT OR REPLACE INTO doc_fulltext VALUES (?,?,?,?)",
        (document_id, url, text, utcnow()))
    conn.commit()
    return text
