"""EU-Kommission „Shaping Europe's digital future" – News des AI Office.

digital-strategy.ec.europa.eu ist die offizielle Publikationsplattform der
GD CNECT / des AI Office für den AI Act: Leitlinien (z. B. Transparenz-
pflichten), GPAI Code of Practice, AI-Omnibus, Enforcement-Meldungen.
Der Site-RSS (/en/rss.xml) ist ungefiltert, sehr kurz (10 Items) und mischt
Events/Tender aller Digitalthemen – Discovery parst daher die themen-
gefilterte News-Liste (?topic=119 = "Artificial intelligence", verifiziert
über die Drupal-Autocomplete-Taxonomie). Jeder Listeneintrag liefert Typ,
Datum und Titel; die Detailseite liefert Teaser (og:description) und
Volltext. Stabile ID: URL-Slug.
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter, strip_html
from .rss import refine_type

BASE = "https://digital-strategy.ec.europa.eu"
PAGES = 2                    # Listenseiten pro Lauf (Seite 0 + 1 reichen stündlich)

META_RE = re.compile(
    r'(?s)<ul class="ecl-content-block__primary-meta-container">(.*?)</ul>')
META_ITEM_RE = re.compile(
    r'(?s)primary-meta-item">(.*?)</li>')
TITLE_RE = re.compile(
    r'(?s)<a\s+href="(/en/(?:news|consultations|library)/[^"]+)"[^>]*>\s*<span>(.*?)</span>')
DATE_RE = re.compile(
    r"(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})", re.I)
MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}

# Meta-Typ der Liste → kanonischer Dokumenttyp; Rest über Titel-Heuristik.
TYPE_MAP = [
    ("consultation", "CONSULTATION"),
    ("call for evidence", "CONSULTATION"),
    ("report", "FINAL_REPORT"),
    ("study", "FINAL_REPORT"),
]


def _strip(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html_mod.unescape(fragment)).split())


class DsNewsAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs: List[DiscoveredDocument] = []
        seen = set()
        first_err = None
        for page in range(PAGES):
            url = self.source["discovery_url"]
            if page:
                url += "&page={}".format(page)
            result, err = http.get(url)
            if err or result is None or result.status != 200:
                first_err = first_err or err or (result.status if result else "?")
                continue
            for block in re.split(r"<article", result.text())[1:]:
                tm = TITLE_RE.search(block)
                mm = META_RE.search(block)
                if not tm or not mm:
                    continue
                path = tm.group(1)
                slug = path.strip("/").rsplit("/", 1)[-1]
                if slug in seen:
                    continue
                seen.add(slug)

                meta = [_strip(i) for i in META_ITEM_RE.findall(mm.group(1))]
                pub = None
                type_text = ""
                for item in meta:
                    dm = DATE_RE.search(item)
                    if dm:
                        pub = "{}-{:02d}-{:02d}".format(
                            dm.group(3), MONTHS[dm.group(2).lower()], int(dm.group(1)))
                    else:
                        type_text = item
                if since and pub and pub < since:
                    continue

                title = _strip(tm.group(2))
                doc_type = None
                for needle, canonical in TYPE_MAP:
                    if needle in type_text.lower():
                        doc_type = canonical
                        break
                if doc_type is None:
                    doc_type = refine_type(title, "OTHER")

                docs.append(DiscoveredDocument(
                    source_id=self.source_id,
                    external_id=slug,
                    title=title[:500],
                    detail_url=BASE + path,
                    document_type=doc_type,
                    authority=self.source["authority"],
                    jurisdiction=self.source["jurisdiction"],
                    publication_date=pub,
                    language="en",
                    status="PUBLISHED",
                    extra={"type_text": type_text or None},
                ))
        if not docs:
            raise RuntimeError(
                "digital-strategy-News ohne erkennbare Einträge "
                "(Layout geändert? Letzter Fehler: {})".format(first_err))
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        if not raw_content:
            return doc
        page = raw_content.decode("utf-8", errors="replace")
        dm = re.search(
            r'<meta (?:property="og:description"|name="description") content="([^"]*)"', page)
        if dm:
            doc.summary = html_mod.unescape(dm.group(1))[:1000] or None
        doc.full_text = strip_html(page)[:200000]
        return doc
