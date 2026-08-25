"""EuGH-Adapter (curia.europa.eu, Pressemitteilungen).

curia bietet kein RSS; Discovery parst die Pressemitteilungs-Liste
(Jalios-CMS): je Item <time>16 Jul 2026</time>, <h3>Titel</h3> in einem
Link auf das PDF (cp<jj><nnn><lang>.pdf) und eine Kurzbeschreibung.
Stabile ID: cp-Nummer. Als Original wird das PDF archiviert (bevorzugt
die deutsche Sprachfassung, sonst Englisch).
"""
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

# Relative Links beziehen sich auf das <base>-Tag der Seite
DEFAULT_BASE = "https://curia.europa.eu/site/"
BASE_RE = re.compile(r'(?is)<base\s+href="([^"]+)"')

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"])}
TIME_RE = re.compile(r"(?is)<time[^>]*>\s*(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})\s*</time>")
H3_RE = re.compile(r"(?is)<h3[^>]*>(.*?)</h3>")
PDF_RE = re.compile(r'href="((?:[^"]*/)?upload/docs/[^"]*?(cp\d{6})(\w{2})\.pdf)"')
DESC_RE = re.compile(r'(?is)curia-itemlist-item-description.*?<p>(.*?)</p>')


def _strip(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", fragment).split())


class CuriaAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("curia-Presseseite nicht erreichbar: {}".format(err))
        html = result.content.decode("utf-8", errors="replace")
        base_m = BASE_RE.search(html)
        base = (base_m.group(1) if base_m else DEFAULT_BASE).rstrip("/") + "/"

        # Seite in Item-Blöcke teilen; jeder Block enthält Zeit, Titel, PDFs.
        blocks = re.split(r'class="curia-itemlist-item(?!-)', html)[1:]
        docs = []
        seen = set()
        for block in blocks:
            pdfs = PDF_RE.findall(block)
            if not pdfs:
                continue
            cp = pdfs[0][1]
            if cp in seen:
                continue
            seen.add(cp)

            by_lang = {lang: href for href, _, lang in pdfs}
            href = by_lang.get("de") or by_lang.get("en") or pdfs[0][0]
            pdf_url = href if href.startswith("http") else base + href.lstrip("/")

            tm = TIME_RE.search(block)
            pub = None
            if tm:
                month = MONTHS.get(tm.group(2).lower()[:3])
                if month:
                    pub = "{}-{:02d}-{:02d}".format(tm.group(3), month, int(tm.group(1)))
            if since and pub and pub < since:
                continue

            h3 = H3_RE.search(block)
            title = _strip(h3.group(1)) if h3 else "Pressemitteilung {}".format(cp)
            desc = DESC_RE.search(block)
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=cp,
                title=title[:500],
                detail_url=pdf_url,
                document_url=pdf_url,
                document_type="COURT_DECISION",
                authority="EuGH",
                jurisdiction="EU",
                publication_date=pub,
                language="de" if "de" in by_lang else "en",
                status="PUBLISHED",
                extra={"summary": _strip(desc.group(1)) if desc else None},
            ))
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("summary")
        # Rechtssachennummer(n) aus dem Titel als Referenz
        cases = re.findall(r"\b[CT]-\d+/\d+\b", d.title)
        if cases:
            doc.reference_number = ", ".join(cases[:3])
        # raw_content ist ein PDF – Volltext-Extraktion bewusst ausgelassen.
        return doc
