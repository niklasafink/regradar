"""Gemeinsames Adapter-Interface.

Downstream-Code (Pipeline) kennt nur discover/fetch/normalize –
nicht, ob eine Quelle RSS, XML, API oder HTML liefert.
"""
from typing import List, Optional

from ..models import CanonicalDocument, DiscoveredDocument


class SourceAdapter:
    source_id = ""

    def __init__(self, source_row: dict):
        self.source = source_row
        self.source_id = source_row["source_id"]

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        """Neue/aktualisierte Dokumentkandidaten ermitteln."""
        raise NotImplementedError

    def fetch_url(self, d: DiscoveredDocument) -> Optional[str]:
        """URL, deren Inhalt als Original archiviert wird (None = nur Metadaten)."""
        return d.document_url or d.detail_url

    def normalize(self, d: DiscoveredDocument, raw_content: Optional[bytes]) -> CanonicalDocument:
        """Kandidat + Rohinhalt in das Canonical Document Model überführen."""
        return CanonicalDocument(
            source_id=d.source_id,
            external_id=d.external_id,
            title=d.title,
            document_type=d.document_type,
            authority=d.authority,
            jurisdiction=d.jurisdiction,
            canonical_url=d.detail_url,
            language=d.language,
            status=d.status,
            publication_date=d.publication_date,
            document_urls=[u for u in [d.document_url] if u],
        )


def strip_html(html: str) -> str:
    """Sehr einfache HTML→Text-Normalisierung (ohne externe Dependencies)."""
    import re
    text = re.sub(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()
