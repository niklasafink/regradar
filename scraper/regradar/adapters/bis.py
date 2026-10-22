"""BIS-Adapter (Basler Ausschuss, CPMI, FSI auf bis.org).

Die BIS-Website wurde im Herbst 2026 auf Drupal umgestellt: die RSS-Feeds
der Ausschüsse (doclist/bcbspubls.rss u. a.) und die alten /publ/-Listen
liefern 404, der Feed-Index kennt nur noch Pressemitteilungen, Reden und
FSI-Publikationen. Stabil und ohne Bot-Schutz erreichbar sind die
Publikationslisten je Ausschuss:

  /committees/bcbs/publications   Basler Ausschuss (Standards, Consultative …)
  /committees/cpmi/publications   CPMI (Zahlungsverkehr, Marktinfrastrukturen)
  /about/fsi/publications         Financial Stability Institute

Jede Liste ist serverseitig gerenderte Karten (`card-link`) mit Serien-
Badge, Datum, Titel und Teaser, neueste zuerst, 10 Einträge je Seite
(?page=N). Stabile ID ist der Slug der Detailseite (/publications/<slug>);
die Detailseite trägt Abstract und PDF-Link, der Volltext-Abruf
(fulltext.py) holt daraus den Teaser. robots.txt erlaubt /committees/ und
/publications/.
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

BASE = "https://www.bis.org"
CARD_RE = re.compile(r'(?s)<a\s+href="(/publications/[^"#?]+)"\s+class="card-link">(.*?)</a>')
BADGE_RE = re.compile(r'(?s)<span\s+class="badge[^"]*"[^>]*>(.*?)</span>')
DATE_RE = re.compile(r'class="card-date[^"]*"[^>]*>\s*(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})\s*<')
TITLE_RE = re.compile(r'(?s)class="card-heading"[^>]*>(.*?)</h5>')
DESC_RE = re.compile(r'(?s)class="card-description"[^>]*>(.*?)</div>')

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"])}

# Serien-Badge → Dokumenttyp. Alles, was nicht aufgeführt ist, bleibt OTHER
# (Newsletter fängt NOISE im Export ab).
SERIES_TYPES = {
    "standards": "STANDARD",
    "consultative": "CONSULTATION",
    "implementation reports": "FINAL_REPORT",
    "qis": "FINAL_REPORT",
    "cpmi papers": "FINAL_REPORT",
    "cpmi briefs": "FINAL_REPORT",
    "fsi insights": "FINAL_REPORT",
    "fsi briefs": "FINAL_REPORT",
    "fsi executive summaries": "FINAL_REPORT",
    "fsi occasional papers": "FINAL_REPORT",
}

# Forschungs-/Arbeitspapiere sind keine Regulierung.
SKIP_SERIES = {"bcbs working papers", "bis working paper", "bis working papers"}

# Die neuesten Einträge stehen auf Seite 0; bei Rückstand (Quelle lange nicht
# gelaufen) reicht eine zweite Seite. Tiefer geht nur der Backfill (since).
MAX_PAGES = 2


def _text(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html_mod.unescape(fragment)).split())


def parse_cards(page: str) -> List[dict]:
    """Karten einer Listenseite → dicts (slug, series, date, title, teaser).
    Karten ohne lesbares Datum oder Titel werden übersprungen."""
    out = []
    for m in CARD_RE.finditer(page):
        body = m.group(2)
        d = DATE_RE.search(body)
        t = TITLE_RE.search(body)
        if not d or not t:
            continue
        month = MONTHS.get(d.group(2).lower())
        title = _text(t.group(1))
        if not month or not title:
            continue
        badges = [_text(b) for b in BADGE_RE.findall(body)]
        desc = DESC_RE.search(body)
        out.append({
            "slug": m.group(1).rsplit("/", 1)[-1],
            "path": m.group(1),
            "series": badges[1] if len(badges) > 1 else "",
            "badges": badges,
            "date": "{}-{:02d}-{:02d}".format(d.group(3), month, int(d.group(1))),
            "title": title,
            "teaser": _text(desc.group(1)) if desc else "",
        })
    return out


class BisAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        base_url = self.source["discovery_url"]
        cards = []
        seen = set()
        for page_no in range(MAX_PAGES):
            url = base_url if page_no == 0 else "{}?page={}".format(base_url, page_no)
            result, err = http.get(url)
            if err or result is None or result.status != 200:
                if page_no == 0:
                    raise RuntimeError("BIS nicht erreichbar ({}): {}".format(url, err))
                break
            page_cards = parse_cards(result.text())
            if not page_cards:
                if page_no == 0:
                    raise RuntimeError(
                        "BIS-Liste ohne erkennbare Einträge (Layout geändert?): " + url)
                break
            for c in page_cards:
                if c["slug"] not in seen:
                    seen.add(c["slug"])
                    cards.append(c)
            # Alles auf der Seite ist älter als der Stichtag: weiter zurück lohnt nicht.
            if since and all(c["date"] < since for c in page_cards):
                break

        docs = []
        for c in cards:
            if since and c["date"] < since:
                continue
            if c["series"].lower() in SKIP_SERIES:
                continue
            detail = BASE + c["path"]
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=c["slug"],
                title=c["title"][:500],
                detail_url=detail,
                document_url=detail + ".pdf",
                document_type=SERIES_TYPES.get(c["series"].lower(), "OTHER"),
                authority=self.source["authority"],
                jurisdiction=self.source["jurisdiction"],
                publication_date=c["date"],
                language="en",
                status="PUBLISHED",
                extra={"series": c["series"], "teaser": c["teaser"],
                       "topics": c["badges"][2:]},
            ))
        return docs

    def fetch_url(self, d):
        return d.detail_url  # Abstract + Status + PDF-Link; PDF selbst nicht archivieren

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("teaser") or None
        return doc
