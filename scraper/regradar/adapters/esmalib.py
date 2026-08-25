"""ESMA-Library-Adapter (Register/Dokumentendatenbank).

Der ESMA-News-RSS ist bei Q&As, Leitlinien-Updates und Registerdokumenten
lückenhaft; die Library listet alle Dokumente. Es gibt keine öffentliche
JSON-API – Discovery parst die Drupal-View-Tabelle (sortiert nach
Erstellungsdatum, neueste zuerst): je Zeile Datum (<time datetime>),
Referenz (ESMA-Dokumentnummer), Titel + Link (/document/<slug>), Sektion
und Dokumenttyp. Stabile ID: der Dokument-Slug.
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter
from .rss import refine_type

BASE = "https://www.esma.europa.eu"
TIME_RE = re.compile(r'view-created[^>]*>.*?datetime="(\d{4}-\d{2}-\d{2})', re.S)
REF_RE = re.compile(r'(?s)view-field-document-reference[^>]*>(.*?)</td>')
TITLE_RE = re.compile(r'(?s)view-title[^>]*>.*?<a href="(/document/[^"]+)"[^>]*>(.*?)</a>')
TYPE_RE = re.compile(r'(?s)view-field-document-type[^>]*>(.*?)</td>')
SECTION_RE = re.compile(r'(?s)view-field-document-section[^>]*>(.*?)</td>')

# Spaltenwert "Type" → kanonischer Dokumenttyp; Rest über Titel-Heuristik.
TYPE_MAP = [
    ("consultation", "CONSULTATION"),
    ("guidelines", "GUIDELINE"),
    ("q&a", "Q_AND_A"),
    ("final report", "FINAL_REPORT"),
    ("technical standards", "RTS"),
    ("opinion", "OTHER"),
]


def _strip(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html_mod.unescape(fragment)).split())


class EsmaLibAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("ESMA-Library nicht erreichbar: {}".format(err))
        page = result.text()

        docs = []
        seen = set()
        for row in re.split(r"<tr", page)[1:]:
            tm = TITLE_RE.search(row)
            dm = TIME_RE.search(row)
            if not tm or not dm:
                continue
            slug = tm.group(1).rsplit("/", 1)[-1]
            if slug in seen:
                continue
            seen.add(slug)
            pub = dm.group(1)
            if since and pub < since:
                continue

            title = _strip(tm.group(2))
            type_m = TYPE_RE.search(row)
            type_text = _strip(type_m.group(1)) if type_m else ""
            doc_type = None
            for needle, canonical in TYPE_MAP:
                if needle in type_text.lower():
                    doc_type = canonical
                    break
            if doc_type is None:
                doc_type = refine_type(title, "OTHER")

            ref_m = REF_RE.search(row)
            section_m = SECTION_RE.search(row)
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=slug,
                title=title[:500],
                detail_url=BASE + tm.group(1),
                document_type=doc_type,
                authority=self.source["authority"],
                jurisdiction=self.source["jurisdiction"],
                publication_date=pub,
                language="en",
                status="PUBLISHED",
                extra={
                    "reference": _strip(ref_m.group(1)) if ref_m else None,
                    "section": _strip(section_m.group(1)) if section_m else None,
                    "type_text": type_text or None,
                },
            ))
        if not docs:
            raise RuntimeError("ESMA-Library ohne erkennbare Zeilen (Layout geändert?)")
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        ref = d.extra.get("reference")
        if ref and re.match(r"ESMA[\w\-]+", ref):
            doc.reference_number = ref
        # Sektion/Typ als Kurzbeschreibung: liefert dem Framework-Mapping
        # Signale wie "Sustainable finance" oder "MiFID II".
        bits = [b for b in (d.extra.get("type_text"), d.extra.get("section")) if b]
        doc.summary = " — ".join(bits) or None
        if raw_content:
            from .base import strip_html
            doc.full_text = strip_html(raw_content.decode("utf-8", errors="replace"))[:200000]
        return doc
