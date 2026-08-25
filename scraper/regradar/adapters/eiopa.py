"""EIOPA-Adapter.

Die EIOPA-Website (Drupal/Europa) bietet kein RSS; Discovery läuft wie bei
AMLA über die sitemap.xml. News-/Publikationsslugs enden auf ein Datum
(…-2026-07-14_en), Konsultationsseiten liegen unter /consultations/.
Nur Einträge ab Cutoff (since bzw. 120 Tage) werden übernommen, sortiert
neueste zuerst, damit das Fetch-Budget die aktuellen Seiten lädt.
Stabile ID: URL-Pfad.
"""
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import urlparse

from .. import http
from ..models import DiscoveredDocument
from .amla import DATE_RE, DEADLINE_RE, SM_NS, _iso
from .base import SourceAdapter, strip_html
from .rss import refine_type

SLUG_DATE = re.compile(r"-(\d{4})-(\d{2})-(\d{2})_en$")
DEFAULT_WINDOW_DAYS = 120


class EiopaAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("EIOPA-Sitemap nicht erreichbar: {}".format(err))
        root = ET.fromstring(result.content)

        cutoff = since or (datetime.utcnow() - timedelta(days=DEFAULT_WINDOW_DAYS)).strftime("%Y-%m-%d")
        docs = []
        for url_el in root.iter(SM_NS + "url"):
            loc = (url_el.findtext(SM_NS + "loc") or "").strip()
            if not loc.endswith("_en"):
                continue
            path = urlparse(loc).path
            lastmod = (url_el.findtext(SM_NS + "lastmod") or "")[:10]

            m = SLUG_DATE.search(path)
            if m:
                pub = "{}-{}-{}".format(m.group(1), m.group(2), m.group(3))
            elif "consultation" in path:
                pub = lastmod or None
            else:
                continue
            if pub and pub < cutoff:
                continue

            slug = path.strip("/").rsplit("/", 1)[-1]
            slug = SLUG_DATE.sub("", slug).replace("_en", "")
            title = slug.replace("-", " ").capitalize()
            default_type = "CONSULTATION" if "consultation" in path else "OTHER"
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=path,
                title=title,
                detail_url=loc,
                document_type=refine_type(title, default_type),
                authority="EIOPA",
                jurisdiction="EU",
                publication_date=pub,
                language="en",
                status="PUBLISHED",
            ))
        docs.sort(key=lambda d: d.publication_date or "", reverse=True)
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        if not raw_content:
            return doc
        html = raw_content.decode("utf-8", errors="replace")

        m = re.search(r"(?is)<h1[^>]*>(.*?)</h1>", html)
        if not m:
            m = re.search(r"(?is)<title>(.*?)</title>", html)
        if m:
            title = " ".join(strip_html(m.group(1)).split())
            title = re.sub(r"\s*\|\s*EIOPA.*$", "", title)
            if title:
                doc.title = title[:400]
                doc.document_type = refine_type(doc.title, doc.document_type)

        text = strip_html(html)
        doc.full_text = text[:300000]
        dl = DEADLINE_RE.search(text)
        if dl:
            dparts = DATE_RE.search(dl.group(1))
            if dparts:
                doc.consultation_deadline = _iso(dparts.group(1), dparts.group(2), dparts.group(3))

        for pdf in re.findall(r'href="([^"]+\.pdf[^"]*)"', html)[:10]:
            if pdf.startswith("/"):
                pdf = "https://www.eiopa.europa.eu" + pdf
            if pdf not in doc.document_urls:
                doc.document_urls.append(pdf)
        return doc
