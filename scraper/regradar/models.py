"""Quellenunabhängige Datenmodelle (Canonical Document Model, vereinfacht)."""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class DiscoveredDocument:
    """Kandidat aus dem Discovery-Schritt einer Quelle."""
    source_id: str
    external_id: str            # stabile fachliche ID (CELEX, ECLI, DIP-ID, GZ, Slug …)
    title: str
    detail_url: str
    document_url: Optional[str] = None
    document_type: str = "OTHER"
    authority: str = ""
    jurisdiction: str = ""
    publication_date: Optional[str] = None   # ISO YYYY-MM-DD
    language: str = "de"
    status: Optional[str] = None
    extra: dict = field(default_factory=dict)


@dataclass
class RawDocument:
    """Unverändert archivierter Abruf."""
    discovered: DiscoveredDocument
    retrieved_at: str
    source_url: str
    http_status: int
    content_type: str
    raw_sha256: str
    raw_storage_path: str
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    content: Optional[bytes] = None


@dataclass
class Section:
    section_id: str             # z. B. "§ 25h" oder "Article 17(2)"
    label: str
    text: str
    order: int


@dataclass
class CanonicalDocument:
    """Normalisierte, quellenunabhängige Fassung."""
    source_id: str
    external_id: str
    title: str
    document_type: str
    authority: str
    jurisdiction: str
    canonical_url: str
    language: str = "de"
    status: Optional[str] = None
    publication_date: Optional[str] = None
    consultation_deadline: Optional[str] = None
    effective_from: Optional[str] = None
    reference_number: Optional[str] = None
    summary: Optional[str] = None
    full_text: Optional[str] = None
    sections: List[Section] = field(default_factory=list)
    document_urls: List[str] = field(default_factory=list)
    raw_sha256: Optional[str] = None
    normalized_sha256: Optional[str] = None
