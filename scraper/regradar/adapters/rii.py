"""Rechtsprechung-im-Internet-Adapter.

Discovery über die offizielle TOC (rii-toc.xml) mit Gericht,
Entscheidungsdatum, Aktenzeichen und Änderungsdatum. Gefiltert auf
BGH und BFH (höchstrichterliche Finanz-Relevanz laut Quellen-Matrix).
Stabile ID: Gericht + Aktenzeichen + Entscheidungsdatum.
"""
import re
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

COURTS = {"BGH", "BFH"}
MAX_DOCS = 80


def _to_iso(d: str) -> Optional[str]:
    d = (d or "").strip()
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", d)
    if m:
        return "{}-{}-{}".format(m.group(3), m.group(2), m.group(1))
    return d[:10] if re.match(r"\d{4}-\d{2}-\d{2}", d) else None


class RiiAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        if not since:
            since = (date.today() - timedelta(days=30)).isoformat()
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("rii-toc.xml nicht erreichbar: {}".format(err))
        root = ET.fromstring(result.content)

        docs = []
        for item in root.iter("item"):
            gericht = (item.findtext("gericht") or "").strip().upper()
            if not any(gericht.startswith(c) for c in COURTS):
                continue
            modified = _to_iso(item.findtext("modified") or "")
            if modified and modified < since:
                continue
            az = (item.findtext("aktenzeichen") or "").strip()
            entsch = _to_iso(item.findtext("entsch-datum") or "")
            link = (item.findtext("link") or "").strip().replace("http://", "https://")
            if not az or not link:
                continue
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id="{}::{}::{}".format(gericht, az, entsch or ""),
                title="{}, {} vom {}".format(gericht, az, entsch or "?"),
                detail_url=link,
                document_url=link,
                document_type="COURT_DECISION",
                authority=gericht,
                jurisdiction="DE",
                publication_date=entsch,
                language="de",
                status="PUBLISHED",
                extra={"modified": modified},
            ))
            if len(docs) >= MAX_DOCS:
                break
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.external_id.split("::")[1]
        if raw_content:
            text, ecli, titel = _parse_decision_zip(raw_content)
            if text:
                doc.full_text = text[:2000000]
            if ecli:
                doc.reference_number = ecli
            if titel:
                doc.title = "{} – {}".format(d.title, titel)[:400]
        return doc


def _parse_decision_zip(raw: bytes):
    import io
    import zipfile
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
        xml_names = [n for n in zf.namelist() if n.endswith(".xml")]
        if not xml_names:
            return None, None, None
        root = ET.fromstring(zf.read(xml_names[0]))
    except Exception:
        return None, None, None
    ecli = (root.findtext(".//ecli") or "").strip() or None
    titel = " ".join((root.findtext(".//titelzeile") or "").split()) or None
    parts = [t.strip() for t in root.itertext() if t and t.strip()]
    return "\n".join(parts), ecli, titel
