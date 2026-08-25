"""Gesetze-im-Internet-Adapter.

Discovery über die offizielle TOC (gii-toc.xml), begrenzt auf eine
Watchlist zentraler Finanzaufsichtsnormen (KWG, GwG, WpHG, KAGB, ZAG …).
Fetch lädt das Norm-XML (xml.zip) und zerlegt es bis auf §-Ebene.
Stabile ID: GII-Slug (z. B. "kredwg"); Änderungserkennung über SHA-256
des Zip-Inhalts.
"""
import io
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import List, Optional
from urllib.parse import urlparse

from .. import http
from ..models import DiscoveredDocument, Section
from ..registry import GII_WATCHLIST
from .base import SourceAdapter


class GiiAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("gii-toc.xml nicht erreichbar: {}".format(err))
        root = ET.fromstring(result.content)

        docs = []
        for item in root.iter("item"):
            link = (item.findtext("link") or "").strip()
            title = (item.findtext("title") or "").strip()
            if not link:
                continue
            path = urlparse(link).path.strip("/")          # z. B. "kredwg/xml.zip"
            slug = path.split("/")[0] if path else ""
            if slug not in GII_WATCHLIST:
                continue
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=slug,
                title=GII_WATCHLIST.get(slug) or title,
                detail_url="https://www.gesetze-im-internet.de/{}/".format(slug),
                document_url=link.replace("http://", "https://"),
                document_type="LAW",
                authority=self.source["authority"],
                jurisdiction="DE",
                language="de",
                status="IN_FORCE",
                extra={"toc_title": title},
            ))
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        if not raw_content:
            return doc
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw_content))
            xml_names = [n for n in zf.namelist() if n.endswith(".xml")]
            if not xml_names:
                return doc
            root = ET.fromstring(zf.read(xml_names[0]))
        except Exception:
            return doc

        sections = []
        texts = []
        order = 0
        for norm in root.iter("norm"):
            meta = norm.find("metadaten")
            if meta is None:
                continue
            enbez = (meta.findtext("enbez") or "").strip()
            titel = (meta.findtext("titel") or "").strip()
            if order == 0:
                doc.publication_date = _iso_date(meta)
                langue = (meta.findtext("langue") or "").strip()
                if langue:
                    doc.title = "{} – {}".format(d.title, langue)[:300] if langue != d.title else d.title
                doc.reference_number = (meta.findtext("jurabk") or "").strip() or None
            text_el = norm.find("./textdaten/text")
            body = _element_text(text_el)
            if enbez and body:
                sections.append(Section(
                    section_id=enbez,
                    label="{} {}".format(enbez, titel).strip(),
                    text=body,
                    order=order,
                ))
                texts.append("{}\n{}".format(enbez, body))
            order += 1

        doc.sections = sections
        doc.full_text = "\n\n".join(texts)[:2000000] or None
        return doc


def _iso_date(meta) -> Optional[str]:
    raw = (meta.findtext("ausfertigung-datum") or "").strip()
    return raw if re.match(r"\d{4}-\d{2}-\d{2}", raw) else None


def _element_text(el) -> str:
    if el is None:
        return ""
    parts = [t.strip() for t in el.itertext() if t and t.strip()]
    return "\n".join(parts)
