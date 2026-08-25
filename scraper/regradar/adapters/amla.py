"""AMLA-Adapter (Referenzadapter laut Backend-Prompt, Kap. 14).

Die AMLA-Website bietet weder RSS noch API; Discovery läuft daher über
die offizielle sitemap.xml, gefiltert auf regulatorisch relevante
Pfade (News, Konsultationen, RTS/ITS-Seiten, Dokumentbibliothek).
Fetch lädt die Detailseite (HTML); daraus werden Datum, Fristen und
PDF-Anhänge extrahiert. Stabile ID: URL-Slug.
"""
import re
import xml.etree.ElementTree as ET
from typing import List, Optional
from urllib.parse import urlparse

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter, strip_html

SM_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"

RELEVANT_PATTERNS = [
    (r"/policy/public-consultations/", "CONSULTATION"),
    (r"/news-media/news-articles/", "OTHER"),
    (r"^/rts-", "RTS"),
    (r"^/its-", "ITS"),
    (r"/guidelines?-", "GUIDELINE"),
]
EXCLUDE = re.compile(r"template|clone-|list-test|page-\d|dd-month-yyyy")

DATE_RE = re.compile(r"(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})", re.I)
MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}
DEADLINE_RE = re.compile(r"(?:deadline|by|until|closes? on)\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})", re.I)


def _iso(day: str, month: str, year: str) -> str:
    return "{}-{:02d}-{:02d}".format(year, MONTHS[month.lower()], int(day))


class AmlaAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("AMLA-Sitemap nicht erreichbar: {}".format(err))
        root = ET.fromstring(result.content)

        docs = []
        for url_el in root.iter(SM_NS + "url"):
            loc = (url_el.findtext(SM_NS + "loc") or "").strip()
            if not loc.endswith("_en"):
                continue
            path = urlparse(loc).path
            if EXCLUDE.search(path):
                continue
            doc_type = None
            for pattern, dtype in RELEVANT_PATTERNS:
                if re.search(pattern, path):
                    doc_type = dtype
                    break
            if not doc_type:
                continue
            slug = path.strip("/").rsplit("/", 1)[-1].replace("_en", "")
            title = slug.replace("-", " ").capitalize()
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=path,
                title=title,
                detail_url=loc,
                document_type=doc_type,
                authority="AMLA",
                jurisdiction="EU",
                language="en",
                status="PUBLISHED",
            ))
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        if not raw_content:
            return doc
        html = raw_content.decode("utf-8", errors="replace")

        # Echter Seitentitel aus <h1> bzw. <title>
        m = re.search(r"(?is)<h1[^>]*>(.*?)</h1>", html)
        if not m:
            m = re.search(r"(?is)<title>(.*?)</title>", html)
        if m:
            title = " ".join(strip_html(m.group(1)).split())
            title = re.sub(r"\s*\|\s*AMLA.*$", "", title)
            if title:
                doc.title = title[:400]

        text = strip_html(html)
        doc.full_text = text[:300000]

        dm = DATE_RE.search(text)
        if dm:
            doc.publication_date = _iso(dm.group(1), dm.group(2), dm.group(3))
        dl = DEADLINE_RE.search(text)
        if dl:
            dparts = DATE_RE.search(dl.group(1))
            if dparts:
                doc.consultation_deadline = _iso(dparts.group(1), dparts.group(2), dparts.group(3))

        # PDF-Anhänge einsammeln
        pdfs = re.findall(r'href="([^"]+\.pdf[^"]*)"', html)
        for pdf in pdfs[:10]:
            if pdf.startswith("/"):
                pdf = "https://www.amla.europa.eu" + pdf
            if pdf not in doc.document_urls:
                doc.document_urls.append(pdf)
        return doc
