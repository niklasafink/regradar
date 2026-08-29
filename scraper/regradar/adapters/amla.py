"""AMLA-Adapter (Referenzadapter laut Backend-Prompt, Kap. 14).

Die AMLA-Website bietet weder RSS noch API; Discovery läuft daher über
die offizielle sitemap.xml, gefiltert auf regulatorisch relevante
Pfade (News, Konsultationen, RTS/ITS-Seiten, Dokumentbibliothek).
Zusätzlich wird die Konsultations-Übersichtsseite direkt ausgelesen,
da die Sitemap neuen Einträgen hinterherhinken kann.
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

CONSULTATIONS_URL = "https://www.amla.europa.eu/policy/public-consultations_en"
CONSULTATION_LINK_RE = re.compile(r'href="(/policy/public-consultations/[^"]+_en)"')


def _iso(day: str, month: str, year: str) -> str:
    return "{}-{:02d}-{:02d}".format(year, MONTHS[month.lower()], int(day))


class AmlaAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs: List[DiscoveredDocument] = []
        seen = set()
        sitemap_err = None

        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            sitemap_err = err or (result.status if result else "?")
        else:
            root = ET.fromstring(result.content)
            for url_el in root.iter(SM_NS + "url"):
                loc = (url_el.findtext(SM_NS + "loc") or "").strip()
                if not loc.endswith("_en"):
                    continue
                path = urlparse(loc).path
                if EXCLUDE.search(path) or path in seen:
                    continue
                doc_type = None
                for pattern, dtype in RELEVANT_PATTERNS:
                    if re.search(pattern, path):
                        doc_type = dtype
                        break
                if not doc_type:
                    continue
                seen.add(path)
                docs.append(self._make_doc(path, doc_type))

        # Konsultations-Übersichtsseite direkt abfragen (Sitemap kann hinken)
        result, err = http.get(CONSULTATIONS_URL)
        if not err and result is not None and result.status == 200:
            html = result.content.decode("utf-8", errors="replace")
            for path in CONSULTATION_LINK_RE.findall(html):
                if EXCLUDE.search(path) or path in seen:
                    continue
                seen.add(path)
                docs.append(self._make_doc(path, "CONSULTATION"))
        elif sitemap_err is not None:
            raise RuntimeError(
                "AMLA nicht erreichbar (Sitemap: {}, Konsultationsseite: {})".format(
                    sitemap_err, err or (result.status if result else "?")))

        return docs

    def _make_doc(self, path: str, doc_type: str) -> DiscoveredDocument:
        slug = path.strip("/").rsplit("/", 1)[-1].replace("_en", "")
        title = slug.replace("-", " ").capitalize()
        return DiscoveredDocument(
            source_id=self.source_id,
            external_id=path,
            title=title,
            detail_url="https://www.amla.europa.eu" + path,
            document_type=doc_type,
            authority="AMLA",
            jurisdiction="EU",
            language="en",
            status="PUBLISHED",
        )

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

        dl = DEADLINE_RE.search(text)
        if dl:
            dparts = DATE_RE.search(dl.group(1))
            if dparts:
                doc.consultation_deadline = _iso(dparts.group(1), dparts.group(2), dparts.group(3))

        # Publikationsdatum: bevorzugt aus <time datetime="…">-Tags (auf
        # Konsultationsseiten das früheste = Veröffentlichung; das spätere
        # ist die Frist). Im Text-Fallback zuerst Fristangaben ("open for
        # comments until …") entfernen, damit nicht die Frist als
        # Publikationsdatum durchgeht.
        times = sorted(re.findall(r'<time[^>]+datetime="(\d{4}-\d{2}-\d{2})', html))
        if times:
            doc.publication_date = times[0]
        else:
            body = DEADLINE_RE.sub(" ", text)
            dm = DATE_RE.search(body)
            if dm:
                doc.publication_date = _iso(dm.group(1), dm.group(2), dm.group(3))

        # Plausibilität: eine Frist vor dem Publikationsdatum ist ein
        # Regex-Fehltreffer (z. B. "signed by 27 June 2025"), keine Frist.
        if (doc.consultation_deadline and doc.publication_date
                and doc.consultation_deadline < doc.publication_date):
            doc.consultation_deadline = None

        # PDF-Anhänge einsammeln
        pdfs = re.findall(r'href="([^"]+\.pdf[^"]*)"', html)
        for pdf in pdfs[:10]:
            if pdf.startswith("/"):
                pdf = "https://www.amla.europa.eu" + pdf
            if pdf not in doc.document_urls:
                doc.document_urls.append(pdf)
        return doc
