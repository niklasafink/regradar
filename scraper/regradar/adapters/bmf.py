"""BMF-Adapter (Bundesministerium der Finanzen).

Frühester deutscher Signalpunkt: Referentenentwürfe und Gesetzesvorhaben
erscheinen auf bundesfinanzministerium.de Wochen vor der DIP-Drucksache.
Die Website bietet kein RSS mehr; Discovery läuft über die sitemap.xml,
gefiltert auf /Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/.
Datum: Datumspräfix im Ordnernamen (2025-10-01-…), sonst <lastmod>.
Stabile ID: URL-Pfad.

Wichtig: Die Detailseiten liegen hinter Radware-Bot-Schutz (Captcha).
Gemäß der defensiven Scraping-Regeln wird das nicht umgangen – BMF ist
eine reine Metadaten-Quelle (kein Fetch); Titel stammen aus dem Slug.
"""
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import urlparse

from .. import http
from ..models import DiscoveredDocument
from .amla import SM_NS
from .base import SourceAdapter

PATH_FILTER = "/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/"
EXCLUDE = re.compile(r"PAPIERKORB", re.I)
FOLDER_DATE = re.compile(r"/(\d{4}-\d{2}-\d{2})-([^/]+)/")
DEFAULT_WINDOW_DAYS = 365


class BmfAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("BMF-Sitemap nicht erreichbar: {}".format(err))
        root = ET.fromstring(result.content)

        cutoff = since or (datetime.utcnow() - timedelta(days=DEFAULT_WINDOW_DAYS)).strftime("%Y-%m-%d")
        docs = []
        seen = set()
        for url_el in root.iter(SM_NS + "url"):
            loc = (url_el.findtext(SM_NS + "loc") or "").strip()
            path = urlparse(loc).path
            if PATH_FILTER not in path or EXCLUDE.search(path):
                continue
            lastmod = (url_el.findtext(SM_NS + "lastmod") or "")[:10]

            m = FOLDER_DATE.search(path)
            pub = m.group(1) if m else (lastmod or None)
            if pub and pub < cutoff:
                continue
            if path in seen:
                continue
            seen.add(path)

            slug = m.group(2) if m else path.strip("/").rsplit("/", 1)[-1].replace(".html", "")
            title = slug.replace("-", " ").replace("_", " ")
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=path,
                title=title,
                detail_url=loc,
                document_type="LEGISLATIVE_PROPOSAL",
                authority="BMF",
                jurisdiction="DE",
                publication_date=pub,
                language="de",
                status="PUBLISHED",
            ))
        docs.sort(key=lambda d: d.publication_date or "", reverse=True)
        return docs

    def fetch_url(self, d):
        return None  # Detailseiten hinter Bot-Schutz – wird nicht umgangen
