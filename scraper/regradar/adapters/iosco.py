"""IOSCO-Adapter (Public Reports).

Internationaler Standardsetzer für Wertpapiermärkte; Reports laufen der
EU-Umsetzung oft 12–24 Monate voraus. Kein RSS – Discovery parst die
Listenseite /publications/?subsection=public_reports: je <li> Referenz +
Titel in <strong>, Datum in <span>, PDF-Link (/library/pubdocs/pdf/
IOSCOPD<nnn>.pdf). Stabile ID: IOSCOPD-Nummer. Die PDFs selbst liegen
hinter Cloudflare-Bot-Schutz (403) → wird nicht umgangen, nur Metadaten
(wie BMF); der PDF-Link bleibt als Primärquelle für den Browser.
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter
from .rss import refine_type

BASE = "https://www.iosco.org"
ITEM_RE = re.compile(
    r'(?s)<li>\s*<strong>(.*?)</strong>(.*?)<span[^>]*>\s*(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})\s*</span>'
    r'.*?href="(/library/pubdocs/pdf/(IOSCOPD[\w\-]+)\.pdf)"')
REF_RE = re.compile(r"^([A-Z]{2,3}/?\d*/\d{4})\s+")

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"])}

# Referenz-Präfix → Dokumenttyp (FR = Final Report, CR = Consultation Report)
PREFIX_TYPES = {"FR": "FINAL_REPORT", "CR": "CONSULTATION", "OR": "FINAL_REPORT"}


def _strip(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html_mod.unescape(fragment)).split())


class IoscoAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("IOSCO-Publikationsliste nicht erreichbar: {}".format(err))
        page = result.text()

        docs = []
        seen = set()
        for m in ITEM_RE.finditer(page):
            pd_id = m.group(7).split("-")[0]  # Addenda auf das Hauptdokument mappen
            if pd_id in seen:
                continue
            seen.add(pd_id)

            month = MONTHS.get(m.group(4).lower())
            pub = None
            if month:
                pub = "{}-{:02d}-{:02d}".format(m.group(5), month, int(m.group(3)))
            if since and pub and pub < since:
                continue

            title = _strip(m.group(1))
            reference = None
            ref_m = REF_RE.match(title)
            if ref_m:
                reference = ref_m.group(1)
                title = title[ref_m.end():].strip() or title
            doc_type = PREFIX_TYPES.get((reference or "").split("/")[0], None) \
                or refine_type(title, "FINAL_REPORT")

            pdf_url = BASE + m.group(6)
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=pd_id,
                title=title[:500],
                detail_url=pdf_url,
                document_url=pdf_url,
                document_type=doc_type,
                authority=self.source["authority"],
                jurisdiction=self.source["jurisdiction"],
                publication_date=pub,
                language="en",
                status="PUBLISHED",
                extra={"reference": reference, "subtitle": _strip(m.group(2)).strip(", ")},
            ))
        if not docs:
            raise RuntimeError("IOSCO-Liste ohne erkennbare Einträge (Layout geändert?)")
        return docs

    def fetch_url(self, d):
        return None  # PDFs hinter Cloudflare-Bot-Schutz, nur Metadaten

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference") or d.external_id
        doc.summary = d.extra.get("subtitle") or None
        return doc
