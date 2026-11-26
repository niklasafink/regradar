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
# Nach so vielen Stunden wird ein leer gebliebener Abruf erneut versucht.
RETRY_AFTER_HOURS = 24


def eurlex_text_url(url: str) -> str:
    """EUR-Lex-Dokumentseiten (TXT/?uri=CELEX:...) zeigen nur Metadaten und
    Navigation. Der Rechtstext selbst liegt unter TXT/HTML/ (deutsch). Alle
    anderen URLs bleiben unverändert."""
    m = re.match(r"https?://eur-lex\.europa\.eu/legal-content/[A-Z]{2}/TXT/(?:HTML/)?\?uri=(CELEX:[^&#]+)", url or "", re.I)
    if not m:
        return url
    return "https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=" + m.group(1)


def _retry_due(fetched_at: Optional[str]) -> bool:
    from datetime import datetime, timedelta, timezone
    if not fetched_at:
        return True
    try:
        ts = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ts > timedelta(hours=RETRY_AFTER_HOURS)


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
    verfügbar). Erfolgreiche Abrufe werden dauerhaft gecacht.

    Fehlschläge NICHT: EUR-Lex antwortet zeitweise mit 202 (Dokument wird
    erst erzeugt), Behördenseiten sind kurz nicht erreichbar. Ein dauerhaft
    gecachter Fehlschlag verurteilt das Dokument sonst für immer zu einer
    Zusammenfassung, die nur aus dem Titel geraten ist. Leere Einträge
    werden deshalb nach RETRY_AFTER_HOURS erneut versucht; tote Links kosten
    damit höchstens einen Abruf pro Tag."""
    if not url:
        return ""
    _ensure_table(conn)
    row = conn.execute(
        "SELECT text, fetched_at FROM doc_fulltext WHERE document_id=?",
        (document_id,)).fetchone()
    if row is not None and (row[0] or not _retry_due(row[1])):
        return row[0]

    text = ""
    result, err = get(eurlex_text_url(url))
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


# --- Verlinkte Unterseiten ---------------------------------------------------
# Viele Meldungen (z. B. BaFin „Bafin veröffentlicht Rundschreiben“) sind nur
# Ankündigungen; der eigentliche Inhalt steht im verlinkten Dokument. Die
# Zusammenfassung und die Impact-Einstufung sollen daher auch diese
# Unterseiten kennen. Der Hauptauszug (fetch_fulltext) bleibt davon
# unberührt – die BaFin-Rundschreiben-Dublettenerkennung liest nur ihn.

# Tiefe 1, höchstens so viele Links, je Link höchstens so viele Zeichen.
LINK_MAX = 2
LINK_CHARS = 9000
# Version der Link-Logik; bei Änderungen hochzählen (alte Einträge werden neu geholt).
LINK_VER = 1

_LINK_PATH = re.compile(
    r"/(rundschreiben|konsultation|auslegungsentscheidung|merkblatt|"
    r"aufsichtsmitteilung|verfuegung|allgemeinverfuegung|faq|"
    r"fachartikel)/|\.pdf(?:$|\?)", re.IGNORECASE)
_LINK_RANK = ("rundschreiben", "auslegungsentscheidung", "merkblatt",
              "aufsichtsmitteilung", "konsultation", "verfuegung", "faq")


def _host(u: str) -> str:
    from urllib.parse import urlsplit
    return urlsplit(u).netloc.lower().removeprefix("www.")


def _content_links(base_url: str, raw_html: str) -> list:
    """Relevante Links aus dem Inhaltsbereich (gleiche Domain, Dokumentpfade)."""
    from urllib.parse import urljoin, urldefrag
    raw = re.sub(r"(?is)<(script|style|nav|header|footer|aside|form)\b.*?</\1>",
                 " ", raw_html)
    for pat in (r"(?is)<main\b.*?</main>", r"(?is)<article\b.*?</article>"):
        m = re.search(pat, raw)
        if m and len(m.group(0)) > 2000:
            raw = m.group(0)
            break
    self_key = urldefrag(base_url)[0].split("?")[0]
    found, seen = [], set()
    for m in re.finditer(r'href=["\']?([^"\'\s>]+)', raw, re.IGNORECASE):
        u = urldefrag(urljoin(base_url, html_mod.unescape(m.group(1))))[0]
        key = u.split("?")[0]
        if (key in seen or key == self_key or _host(u) != _host(base_url)
                or not _LINK_PATH.search(u) or "/EN/" in u):
            continue
        seen.add(key)
        low = u.lower()
        rank = next((i for i, k in enumerate(_LINK_RANK) if "/" + k in low),
                    len(_LINK_RANK))
        found.append((rank, len(found), u))
    return [u for _, _, u in sorted(found)[:LINK_MAX]]


def _page_text(url: str, limit: int = LINK_CHARS) -> str:
    res, _ = get(url)
    if not res or res.status != 200:
        return ""
    if ("pdf" in res.content_type or url.lower().split("?")[0].endswith(".pdf")
            or res.content[:5] == b"%PDF-"):
        text = _pdf_text(res.content)
    else:
        raw = res.text()
        text = _html_text(raw)
        if len(text) < 1500:  # Dokumentseite mit PDF-Download
            pdf_url = _linked_pdf(res.url, raw)
            if pdf_url:
                pdf_res, _ = get(pdf_url)
                if pdf_res and pdf_res.status == 200:
                    pt = _pdf_text(pdf_res.content)
                    if _plausible(pt):
                        text = "{}\n{}".format(text, pt).strip()
    return text[:limit] if _plausible(text) else ""


def fetch_linked(conn: sqlite3.Connection, document_id: int,
                 url: Optional[str]) -> str:
    """Gecachter Auszug der von der Meldung verlinkten Unterseiten ('' wenn
    keine). Leere Ergebnisse werden nach RETRY_AFTER_HOURS neu versucht."""
    if not url:
        return ""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS doc_linked (
               document_id INTEGER PRIMARY KEY,
               text TEXT NOT NULL, fetched_at TEXT NOT NULL, ver INTEGER NOT NULL)""")
    row = conn.execute(
        "SELECT text, fetched_at, ver FROM doc_linked WHERE document_id=?",
        (document_id,)).fetchone()
    if row is not None and row[2] == LINK_VER and (row[0] or not _retry_due(row[1])):
        return row[0]
    if url.lower().split("?")[0].endswith(".pdf"):
        return ""
    res, _ = get(url)
    parts = []
    if res and res.status == 200:
        for link in _content_links(res.url, res.text()):
            t = _page_text(link)
            if t:
                parts.append("[Verlinkte Unterseite {}]\n{}".format(link, t))
    text = "\n\n".join(parts)
    from .db import utcnow
    conn.execute("INSERT OR REPLACE INTO doc_linked VALUES (?,?,?,?)",
                 (document_id, text, utcnow(), LINK_VER))
    conn.commit()
    return text


def linked_docs(url: str, limit: int = LINK_CHARS) -> list:
    """Ungecacht: [(link, text)] der verlinkten Dokumente (für Detailseiten)."""
    res, _ = get(url)
    if not res or res.status != 200 or url.lower().split("?")[0].endswith(".pdf"):
        return []
    out = []
    for link in _content_links(res.url, res.text()):
        t = _page_text(link, limit)
        if t:
            out.append((link, t))
    return out
