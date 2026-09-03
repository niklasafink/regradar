"""EU-Kommission, GD FISMA – „Finance news" auf finance.ec.europa.eu.

Die Generaldirektion Finanzstabilität, Finanzdienstleistungen und
Kapitalmarktunion veröffentlicht hier Gesetzgebungsvorschläge, Konsultationen
und Einigungen zu Kleinanlegerstrategie (RIS), Verbriefung, PSD3/PSR,
Digitalem Euro, Market-Integration-Paket, Sanktionspaketen u. a. – also
genau die Frühwarnsignale, die Rat und Parlament (Bot-Schutz) nicht per
Feed liefern. Es gibt keinen RSS-Feed; die Liste nutzt das ECL-Markup der
Kommission (wie digital-strategy), aber mit Links `/news/<slug>` ohne
<span> und mit Teaser direkt in der Liste. Pagination per `?page=N`.
Stabile ID: URL-Slug (enthält das Datum, z. B. …-2026-07-23_en).
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter, strip_html
from .dsnews import DATE_RE, MONTHS, META_ITEM_RE, META_RE, TYPE_MAP, _strip
from .rss import refine_type

BASE = "https://finance.ec.europa.eu"
PAGES = 2

TITLE_RE = re.compile(
    r'(?s)<div class="ecl-content-block__title">\s*<a\s+href="(/news/[^"]+)"[^>]*>(.*?)</a>')
DESC_RE = re.compile(
    r'(?s)<div class="ecl-content-block__description">(.*?)</div>')
TIME_RE = re.compile(r'<time datetime="(\d{4}-\d{2}-\d{2})')


class EcFinanceAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs: List[DiscoveredDocument] = []
        seen = set()
        first_err = None
        for page in range(PAGES):
            url = self.source["discovery_url"]
            if page:
                url += "?page={}".format(page)
            result, err = http.get(url)
            if err or result is None or result.status != 200:
                first_err = first_err or err or (result.status if result else "?")
                continue
            for block in re.split(r"<article", result.text())[1:]:
                tm = TITLE_RE.search(block)
                if not tm:
                    continue
                path = tm.group(1)
                slug = path.strip("/").rsplit("/", 1)[-1]
                if slug in seen:
                    continue
                seen.add(slug)

                pub = None
                type_text = ""
                mm = META_RE.search(block)
                if mm:
                    for item in META_ITEM_RE.findall(mm.group(1)):
                        tmatch = TIME_RE.search(item)
                        text = _strip(item)
                        dm = DATE_RE.search(text)
                        if tmatch:
                            pub = tmatch.group(1)
                        elif dm:
                            pub = "{}-{:02d}-{:02d}".format(
                                dm.group(3), MONTHS[dm.group(2).lower()], int(dm.group(1)))
                        else:
                            type_text = text
                if not pub:
                    sm = re.search(r"(\d{4}-\d{2}-\d{2})_[a-z]{2}$", slug)
                    pub = sm.group(1) if sm else None
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

                dm_ = DESC_RE.search(block)
                desc = _strip(dm_.group(1)) if dm_ else ""

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
                    extra={"type_text": type_text or None, "description": desc or None},
                ))
        if not docs:
            raise RuntimeError(
                "DG-FISMA-News ohne erkennbare Einträge "
                "(Layout geändert? Letzter Fehler: {})".format(first_err))
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("description") or None
        if not raw_content:
            return doc
        page = raw_content.decode("utf-8", errors="replace")
        if not doc.summary:
            dm = re.search(
                r'<meta (?:property="og:description"|name="description") content="([^"]*)"', page)
            if dm:
                doc.summary = html_mod.unescape(dm.group(1))[:1000] or None
        doc.full_text = strip_html(page)[:200000]
        return doc
