"""Big-4-Kommentare: Fachbeiträge der großen Beratungs-/Prüfungsgesellschaften
(PwC, KPMG, Deloitte Legal) plus ausgewählte Fachblogs zu den Behörden-Updates.

Discovery je Quelle:
  - PwC-Blogs            WordPress-RSS (blogs.pwc.de/…/feed/)
  - PwC Legal            serverseitiges HTML-Listing (article-teaser-Blöcke)
  - KPMG Klardenker      serverseitiges HTML-Listing (regulatory-update-item)
  - Deloitte Legal       Sitemap (sitemap_dl_de.xml) + og:title/description
                         der neuen Artikelseiten (Fetch-Budget pro Lauf)
  - Wald vor lauter Normen  WordPress-RSS

Zuordnung zu Behörden-Updates in drei Stufen:
  1. Regex-Vorfilter (FRAMEWORK_RULES aus webexport) ordnet jeden Artikel
     einem Rahmenwerk zu; Artikel ohne Treffer bleiben unzugeordnet.
  1b. Zeitfenster: Fachbeiträge kommentieren eine Meldung in der Regel
     binnen weniger Tage – Artikel, deren Publikationsdatum mehr als
     MATCH_WINDOW_DAYS vom Meldungsdatum abweicht (oder fehlt), werden
     gar nicht erst geprüft. Das verhindert z. B., dass ein Artikel zum
     AI Act von 2024 einem Durchführungsgesetz von 2026 zugeordnet wird.
  2. Pro exportiertem Behörden-Update entscheidet ein günstiges LLM (über
     OpenRouter, wie llmfilter), welche Artikel des Rahmenwerks genau diese
     Meldung kommentieren. Ergebnisse werden pro (Dokument, Artikel)-Paar
     in SQLite gecacht. Ohne API-Key werden keine Zuordnungen getroffen
     (konservativ: lieber kein Artikel als ein falscher).
"""
import json
import re
import sqlite3
import urllib.error
from typing import Dict, List, Optional, Tuple

from . import http
from .db import utcnow

DELOITTE_SITEMAP = "https://www.deloittelegal.de/dl/sitemaps/sitemap_dl_de.xml"
DELOITTE_FETCH_BUDGET = 15   # neue Artikelseiten pro Lauf (Höflichkeitslimit)

PWC_BLOG_FEEDS = [
    "https://blogs.pwc.de/de/regulatory/feed/",
    "https://blogs.pwc.de/de/steuern-und-recht/feed/",
    "https://blogs.pwc.de/de/sustainability/feed/",
    "https://blogs.pwc.de/de/german-tax-and-legal-news/feed/",
    "https://blogs.pwc.de/de/accounting-and-reporting/feed/",
]
WVLN_FEED = "https://www.waldvorlauternormen.com/feed/"
PWC_LEGAL_LIST = "https://legal.pwc.de/de/news/fachbeitraege"
KPMG_LIST = "https://klardenker.kpmg.de/financialservices-hub/regulatory-update/"

MATCH_MODEL_ENV = "OPENROUTER_MODEL"
MATCH_BATCH_MAX = 20         # Artikel pro LLM-Anfrage
MATCH_WINDOW_DAYS = 14       # Artikel max. ±2 Wochen um das Meldungsdatum

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "mär": 3, "mrz": 3, "apr": 4, "mai": 5,
    "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "okt": 10, "oct": 10,
    "nov": 11, "dez": 12, "dec": 12,
}

MATCH_PROMPT = (
    "Du ordnest Fachbeiträge von Beratungsgesellschaften einer konkreten "
    "Meldung einer Finanzaufsichtsbehörde zu.\n\n"
    "Du erhältst die Behördenmeldung (Titel, ggf. Zusammenfassung) und eine "
    "JSON-Liste von Artikeln mit id, title und teaser. Ein Artikel passt nur "
    "dann (true), wenn er genau dieses Dokument bzw. Vorhaben der Behörde "
    "bespricht – gleiche Verlautbarung, gleiches Rundschreiben, gleiche "
    "Konsultation oder deren unmittelbare Umsetzung. Ein Artikel, der nur "
    "dasselbe Themengebiet, ein anderes Dokument derselben Behörde oder eine "
    "frühere/spätere, klar andere Verlautbarung behandelt, passt nicht "
    "(false). Im Zweifel: false.\n\n"
    "Antworte ausschließlich mit einem JSON-Objekt, das jede id auf true "
    "oder false abbildet. Keine Erklärungen."
)


# --------------------------------------------------------------- Persistenz

def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS big4_articles (
               article_id   INTEGER PRIMARY KEY AUTOINCREMENT,
               firm         TEXT NOT NULL,
               url          TEXT NOT NULL UNIQUE,
               title        TEXT NOT NULL,
               teaser       TEXT,
               published    TEXT,            -- ISO YYYY-MM-DD
               framework    TEXT,            -- Rahmenwerk-ID aus FRAMEWORK_RULES
               discovered_at TEXT NOT NULL
           )""")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS big4_matches (
               document_id  INTEGER NOT NULL,
               article_id   INTEGER NOT NULL,
               related      INTEGER NOT NULL,
               model        TEXT,
               checked_at   TEXT,
               PRIMARY KEY (document_id, article_id)
           )""")
    conn.commit()


def _framework_for(text: str) -> Optional[str]:
    from .webexport import FRAMEWORK_RULES
    lowered = text.lower()
    for fw_id, pattern in FRAMEWORK_RULES:
        if re.search(pattern, lowered):
            return fw_id
    return None


def _upsert(conn, firm: str, url: str, title: str, teaser: Optional[str],
            published: Optional[str]) -> bool:
    """Artikel einfügen; True = neu. Rahmenwerk wird beim Einfügen bestimmt."""
    title = " ".join((title or "").split())[:300]
    if not title or not url:
        return False
    known = conn.execute("SELECT article_id FROM big4_articles WHERE url=?", (url,)).fetchone()
    if known:
        return False
    fw = _framework_for("{} {}".format(title, teaser or ""))
    conn.execute(
        "INSERT INTO big4_articles (firm, url, title, teaser, published, framework, discovered_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (firm, url, title, _clean_teaser(teaser), published, fw, utcnow()))
    return True


def _clean_teaser(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    text = re.sub(r"<[^>]+>", " ", text)
    text = " ".join(text.split())
    return text[:400] or None


# --------------------------------------------------------------- Discovery

def _get(url: str) -> Optional[str]:
    result, err = http.get(url)
    if err or result is None or result.status != 200:
        print("  ! nicht erreichbar: {} ({})".format(url, err or (result and result.status)))
        return None
    return result.text()


def _rss_items(xml_text: str):
    """(title, link, pubdate_iso, description) aus RSS 2.0."""
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except ET.ParseError:
        return
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        desc = item.findtext("description") or ""
        pub = None
        raw = (item.findtext("pubDate") or "").strip()
        if raw:
            try:
                pub = parsedate_to_datetime(raw).strftime("%Y-%m-%d")
            except Exception:
                pub = None
        if title and link:
            yield title, link, pub, desc


def _scrape_rss(conn, firm: str, feeds: List[str]) -> int:
    new = 0
    for feed in feeds:
        text = _get(feed)
        if not text:
            continue
        for title, link, pub, desc in _rss_items(text):
            if _upsert(conn, firm, link.split("?")[0], title, desc, pub):
                new += 1
    conn.commit()
    return new


def _parse_de_month_date(raw: str) -> Optional[str]:
    """'05 Jan 2026' / '05. Mär 2026' → ISO."""
    m = re.search(r"(\d{1,2})\.?\s+([A-Za-zäöü]{3,4})\.?\s+(\d{4})", raw)
    if not m:
        return None
    month = MONTHS.get(m.group(2).lower()[:3])
    if not month:
        return None
    return "{}-{:02d}-{:02d}".format(m.group(3), month, int(m.group(1)))


def _scrape_pwc_legal(conn) -> int:
    html = _get(PWC_LEGAL_LIST)
    if not html:
        return 0
    new = 0
    for m in re.finditer(
            r'<a href="(/de/news/fachbeitraege/[^"]+)" class="article-teaser__link"[^>]*>\s*'
            r'<span class="article-teaser__headline">(.*?)</span>(.*?)</a>', html, re.S):
        path, title, meta = m.groups()
        import html as html_mod
        title = html_mod.unescape(re.sub(r"<[^>]+>", " ", title))
        pub = None
        dm = re.search(r'post-meta__item">\s*([^<]+?)\s*<', meta)
        if dm:
            pub = _parse_de_month_date(dm.group(1))
        if _upsert(conn, "PwC Legal", "https://legal.pwc.de" + path, title, None, pub):
            new += 1
    conn.commit()
    return new


def _scrape_kpmg(conn) -> int:
    html = _get(KPMG_LIST)
    if not html:
        return 0
    new = 0
    for m in re.finditer(
            r'<div class="regulatory-update-item">\s*<a href="([^"]+)">\s*<h3\b[^>]*>(.*?)</h3>\s*</a>\s*'
            r'<div class="post-meta">\s*(\d{2}\.\d{2}\.\d{4})', html, re.S):
        url, h3, date_de = m.groups()
        import html as html_mod
        # Regulator-Flag-Div aus der Überschrift entfernen, Rest ist der Titel.
        h3 = re.sub(r"<div[^>]*>.*?</div>", " ", h3, flags=re.S)
        title = html_mod.unescape(" ".join(re.sub(r"<[^>]+>", " ", h3).split()))
        d, mo, y = date_de.split(".")
        if _upsert(conn, "KPMG", url.split("?")[0], title, None, "{}-{}-{}".format(y, mo, d)):
            new += 1
    conn.commit()
    return new


def _scrape_deloitte(conn) -> int:
    xml_text = _get(DELOITTE_SITEMAP)
    if not xml_text:
        return 0
    entries = re.findall(
        r"<url>\s*<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?", xml_text)
    skip = ("webcast", "podcast", "studien-publikationen", "aktuelle-artikel",
            "doing-business-in-germany", "wiwo-top-kanzlei", "archiv-")
    candidates = []
    for loc, lastmod in entries:
        if "/services/legal/perspectives/" not in loc:
            continue
        if any(s in loc for s in skip):
            continue
        candidates.append((loc, (lastmod or "")[:10] or None))
    # Neueste zuerst; nur noch unbekannte Seiten laden (Budget pro Lauf).
    candidates.sort(key=lambda x: x[1] or "", reverse=True)
    new = 0
    budget = DELOITTE_FETCH_BUDGET
    for url, lastmod in candidates:
        if budget <= 0:
            break
        if conn.execute("SELECT 1 FROM big4_articles WHERE url=?", (url,)).fetchone():
            continue
        page = _get(url)
        budget -= 1
        if not page:
            continue
        tm = re.search(r'<meta property="og:title" content="([^"]*)"', page)
        dm = re.search(r'<meta (?:property="og:description"|name="description") content="([^"]*)"', page)
        pm = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', page)
        import html as html_mod
        title = html_mod.unescape(tm.group(1)) if tm else None
        teaser = html_mod.unescape(dm.group(1)) if dm else None
        if title and _upsert(conn, "Deloitte Legal", url, title, teaser,
                             pm.group(1) if pm else lastmod):
            new += 1
    conn.commit()
    return new


def reclassify(conn: sqlite3.Connection) -> int:
    """Rahmenwerk-Zuordnung aller Artikel neu ableiten (nach Regel-Änderungen
    in FRAMEWORK_RULES). Matches bleiben gültig, da pro Artikel gecacht."""
    ensure_tables(conn)
    changed = 0
    for r in conn.execute("SELECT article_id, title, teaser, framework FROM big4_articles"):
        fw = _framework_for("{} {}".format(r["title"], r["teaser"] or ""))
        if fw != r["framework"]:
            conn.execute("UPDATE big4_articles SET framework=? WHERE article_id=?",
                         (fw, r["article_id"]))
            changed += 1
    conn.commit()
    return changed


def scrape(conn: sqlite3.Connection) -> dict:
    """Alle Big-4-Quellen abgrasen; idempotent (URL ist eindeutig)."""
    ensure_tables(conn)
    stats = {"reclassified": reclassify(conn)}
    print("→ PwC-Blogs …", flush=True)
    stats["pwc_blogs"] = _scrape_rss(conn, "PwC", PWC_BLOG_FEEDS)
    print("→ PwC Legal …", flush=True)
    stats["pwc_legal"] = _scrape_pwc_legal(conn)
    print("→ KPMG Klardenker …", flush=True)
    stats["kpmg"] = _scrape_kpmg(conn)
    print("→ Deloitte Legal …", flush=True)
    stats["deloitte"] = _scrape_deloitte(conn)
    # Blog "Wald vor lauter Normen" wird von Waldeck Rechtsanwälte betrieben.
    print("→ Waldeck Rechtsanwälte (Wald vor lauter Normen) …", flush=True)
    stats["wvln"] = _scrape_rss(conn, "Waldeck Rechtsanwälte", [WVLN_FEED])
    total = conn.execute("SELECT COUNT(*) FROM big4_articles").fetchone()[0]
    mapped = conn.execute(
        "SELECT COUNT(*) FROM big4_articles WHERE framework IS NOT NULL").fetchone()[0]
    stats.update({"total": total, "framework_mapped": mapped})
    return stats


# --------------------------------------------------------------- Matching

def _llm_match(update_text: str, articles: List[sqlite3.Row]) -> Optional[Dict[int, bool]]:
    """LLM-Urteil pro Artikel; None bei Fehler (dann nicht cachen)."""
    from .llmfilter import API_URL, api_key
    import os
    import urllib.request
    key = api_key()
    if not key:
        return None
    model = os.environ.get(MATCH_MODEL_ENV) or "google/gemini-2.5-flash-lite"
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": MATCH_PROMPT},
            {"role": "user", "content": json.dumps({
                "behoerdenmeldung": update_text,
                "artikel": [
                    {"id": a["article_id"], "title": a["title"],
                     "teaser": (a["teaser"] or "")[:300]}
                    for a in articles],
            }, ensure_ascii=False)},
        ],
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer {}".format(key),
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"].strip()
        content = content.removeprefix("```json").removeprefix("```").removesuffix("```")
        parsed = json.loads(content)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, TimeoutError) as e:
        print("Big4-Match: Anfrage übersprungen ({}: {})".format(type(e).__name__, e))
        return None
    out = {}
    for a in articles:
        v = parsed.get(str(a["article_id"]), parsed.get(a["article_id"]))
        if isinstance(v, bool):
            out[a["article_id"]] = v
    return out


def _within_window(published: Optional[str], doc_date: Optional[str]) -> bool:
    """True, wenn Artikel- und Meldungsdatum höchstens MATCH_WINDOW_DAYS
    auseinanderliegen. Ohne Artikel­datum konservativ False (kein Beleg für
    zeitliche Nähe); ohne Meldungsdatum keine Einschränkung."""
    if not doc_date:
        return True
    if not published:
        return False
    from datetime import date
    try:
        delta = date.fromisoformat(published[:10]) - date.fromisoformat(doc_date[:10])
    except ValueError:
        return False
    return abs(delta.days) <= MATCH_WINDOW_DAYS


def related_articles(conn: sqlite3.Connection, document_id: int, framework: str,
                     update_text: str, doc_date: Optional[str] = None,
                     max_items: int = 4) -> List[dict]:
    """Passende Big-4-Artikel zu einem Behörden-Update (Zeitfenster +
    LLM-geprüft, gecacht). doc_date = Publikationsdatum der Meldung (ISO)."""
    ensure_tables(conn)
    candidates = conn.execute(
        "SELECT article_id, firm, url, title, teaser, published "
        "FROM big4_articles WHERE framework=? ORDER BY published DESC",
        (framework,)).fetchall()
    candidates = [a for a in candidates if _within_window(a["published"], doc_date)]
    if not candidates:
        return []

    cached = {r["article_id"]: bool(r["related"]) for r in conn.execute(
        "SELECT article_id, related FROM big4_matches WHERE document_id=?",
        (document_id,))}
    todo = [a for a in candidates if a["article_id"] not in cached]

    from .llmfilter import api_key
    if todo and api_key():
        import os
        model = os.environ.get(MATCH_MODEL_ENV) or "google/gemini-2.5-flash-lite"
        for start in range(0, len(todo), MATCH_BATCH_MAX):
            batch = todo[start:start + MATCH_BATCH_MAX]
            verdicts = _llm_match(update_text, batch)
            if verdicts is None:
                continue  # Fehler: nicht cachen, nächster Lauf versucht es erneut
            now = utcnow()
            for a in batch:
                v = verdicts.get(a["article_id"])
                if v is None:
                    continue
                cached[a["article_id"]] = v
                conn.execute(
                    "INSERT OR REPLACE INTO big4_matches VALUES (?,?,?,?,?)",
                    (document_id, a["article_id"], int(v), model, now))
        conn.commit()

    out = []
    for a in candidates:
        if not cached.get(a["article_id"]):
            continue
        item = {"f": a["firm"], "ti": a["title"], "url": a["url"]}
        if a["published"]:
            y, m, d = a["published"][:10].split("-")
            item["d"] = "{}.{}.{}".format(d, m, y)
        out.append(item)
        if len(out) >= max_items:
            break
    return out
