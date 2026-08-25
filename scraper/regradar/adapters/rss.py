"""Generischer RSS-Adapter.

Deckt ab: BGBl (recht.bund.de), BaFin, EBA, ESMA, EZB-SSM, Bundesbank,
BSI, EDPB, BfDI, FIU (zoll.de), ESRB, BIS/BCBS, FSB.
Versteht RSS 2.0 und RSS 1.0/RDF (BIS: Items im RSS-1.0-Namespace,
Datum in dc:date). Externe ID = Link-URL-Pfad (stabil genug für News-/
Rundschreiben-Feeds); fachliche Referenzen (Geschäftszeichen,
EBA/GL-Nummern) werden zusätzlich aus dem Titel extrahiert, sofern
erkennbar.
"""
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import List, Optional
from urllib.parse import urlparse

from .. import http
from ..models import DiscoveredDocument
from ..registry import RSS_FEEDS, RSS_NO_FETCH
from .base import SourceAdapter

# Titelmuster → Dokumenttyp-Verfeinerung
TYPE_PATTERNS = [
    (r"(?i)\bconsult|konsultation", "CONSULTATION"),
    (r"(?i)\brundschreiben", "CIRCULAR"),
    (r"(?i)\bguidelines?\b|leitlinien", "GUIDELINE"),
    (r"(?i)\bfinal report", "FINAL_REPORT"),
    # RTS/ITS bewusst case-sensitiv, sonst matcht "its" als Wort
    (r"\bRTS\b|(?i:regulatory technical standard)", "RTS"),
    (r"\bITS\b|(?i:implementing technical standard)", "ITS"),
    (r"(?i)\bQ&A|questions and answers", "Q_AND_A"),
    (r"(?i)\ballgemeinverfügung", "GENERAL_DECISION"),
    (r"(?i)\bauslegungsentscheidung|merkblatt", "ADMINISTRATIVE_PRACTICE"),
]

REF_PATTERNS = [
    r"\b(EBA/(?:GL|RTS|ITS|CP|Op)/\d{4}/\d+)\b",
    r"\b(ESMA[\w\-]*\d{2,}[\w\-]*)\b",
    r"\bRundschreiben\s+(\d+/\d{4})",
    r"\b(GZ:\s*\S+)\b",
]


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _iter_items(root):
    """Alle <item>-Elemente, egal ob RSS 2.0 (ohne Namespace, unter
    channel) oder RSS 1.0/RDF (im RSS-1.0-Namespace, unter rdf:RDF)."""
    for el in root.iter():
        if _local(el.tag) == "item":
            yield el


def _childtext(item, name: str) -> str:
    """Text des ersten direkten Kindes mit lokalem Namen `name`."""
    for el in item:
        if _local(el.tag) == name:
            return (el.text or "").strip()
    return ""


def _parse_date(value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).strftime("%Y-%m-%d")
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(value[:19], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def refine_type(title: str, default: str) -> str:
    for pattern, doc_type in TYPE_PATTERNS:
        if re.search(pattern, title):
            return doc_type
    return default


def _links_from_html(html_fragment: str):
    """(url, linktext)-Paare aus einem HTML-Fragment (z. B. RSS-Description)."""
    import html as html_mod
    text = html_mod.unescape(html_fragment)
    pairs = []
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', text, re.S):
        label = re.sub(r"<[^>]+>", " ", m.group(2))
        label = " ".join(label.split())
        pairs.append((m.group(1), label))
    return pairs


def extract_reference(title: str) -> Optional[str]:
    for pattern in REF_PATTERNS:
        m = re.search(pattern, title)
        if m:
            return m.group(1)
    return None


class RssAdapter(SourceAdapter):
    def feeds(self):
        return RSS_FEEDS.get(self.source_id) or [
            (self.source["discovery_url"], "OTHER", "de")
        ]

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs = []
        seen = set()
        for feed_url, default_type, lang in self.feeds():
            result, err = http.get(feed_url)
            if err or result is None or result.status != 200:
                raise RuntimeError("Feed nicht erreichbar: {} ({})".format(feed_url, err or result.status))
            try:
                root = ET.fromstring(result.content)
            except ET.ParseError as e:
                raise RuntimeError("Feed-XML ungültig: {} ({})".format(feed_url, e))

            for item in _iter_items(root):
                title = _childtext(item, "title")
                link = _childtext(item, "link")
                if not title or not link:
                    continue
                pub = _parse_date(_childtext(item, "pubDate") or _childtext(item, "date"))
                if since and pub and pub < since:
                    continue
                desc = _childtext(item, "description")

                # EBA liefert Digest-Items ("E-mail alert") – die eigentlichen
                # Veröffentlichungen stehen als Links in der Beschreibung.
                if self.source_id == "eba" and re.match(r"(?i)EBA E-mail alert", title):
                    for sub_url, sub_title in _links_from_html(desc):
                        sub_id = urlparse(sub_url).path.rstrip("/") or sub_url
                        if sub_id in seen or "eba.europa.eu" not in sub_url:
                            continue
                        seen.add(sub_id)
                        docs.append(DiscoveredDocument(
                            source_id=self.source_id,
                            external_id=sub_id,
                            title=sub_title[:500] or sub_url,
                            detail_url=sub_url,
                            document_type=refine_type(sub_title, default_type),
                            authority=self.source["authority"],
                            jurisdiction=self.source["jurisdiction"],
                            publication_date=pub,
                            language=lang,
                            status="PUBLISHED",
                            extra={"reference": extract_reference(sub_title)},
                        ))
                    continue

                external_id = urlparse(link).path.rstrip("/") or link
                if external_id in seen:
                    continue
                seen.add(external_id)
                docs.append(DiscoveredDocument(
                    source_id=self.source_id,
                    external_id=external_id,
                    title=title,
                    detail_url=link,
                    document_type=refine_type(title, default_type),
                    authority=self.source["authority"],
                    jurisdiction=self.source["jurisdiction"],
                    publication_date=pub,
                    language=lang,
                    status="PUBLISHED",
                    extra={"description": desc, "reference": extract_reference(title)},
                ))
        return docs

    def fetch_url(self, d):
        if self.source_id in RSS_NO_FETCH:
            return None
        return super().fetch_url(d)

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description") or None
        if raw_content:
            from .base import strip_html
            try:
                doc.full_text = strip_html(raw_content.decode("utf-8", errors="replace"))[:200000]
            except Exception:
                doc.full_text = None
        return doc
