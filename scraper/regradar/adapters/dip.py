"""DIP-Adapter (Dokumentations- und Informationssystem Bundestag/Bundesrat).

Offizielle REST-API. Der frei publizierte API-Key (dip.bundestag.de →
Hilfe → DIP-API) wird über die Umgebungsvariable DIP_API_KEY erwartet;
ohne Key meldet der Adapter einen verständlichen Fehler statt zu crawlen.
Stabile ID: DIP-Vorgangs-ID.
"""
import json
import os
from datetime import date, timedelta
from typing import List, Optional
from urllib.parse import urlencode

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

API_BASE = "https://search.dip.bundestag.de/api/v1"

# Frühwarn-Filter: Gesetzgebung mit Finanzbezug
KEYWORDS = [
    "kreditwesen", "geldwäsche", "finanzaufsicht", "wertpapier", "kapitalanlage",
    "zahlungsdienste", "versicherungsaufsicht", "bafin", "bankenaufsicht",
    "finanzmarkt", "kryptowert", "investmentfonds",
]


class DipAdapter(SourceAdapter):
    def _api_key(self) -> Optional[str]:
        return os.environ.get("DIP_API_KEY")

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        key = self._api_key()
        if not key:
            raise RuntimeError(
                "DIP_API_KEY fehlt. Aktuellen öffentlichen Key von "
                "https://dip.bundestag.de (Hilfe → DIP-API) kopieren und "
                "als Umgebungsvariable DIP_API_KEY setzen."
            )
        if not since:
            since = (date.today() - timedelta(days=30)).isoformat()

        params = {
            "f.vorgangstyp": "Gesetzgebung",
            "f.aktualisiert.start": since + "T00:00:00+02:00",
            "format": "json",
            "rows": "100",
        }
        url = "{}/vorgang?{}".format(API_BASE, urlencode(params))
        result, err = http.get(url, extra_headers={"Authorization": "ApiKey " + key})
        if err or result is None or result.status != 200:
            raise RuntimeError("DIP-API fehlgeschlagen: {}".format(err or result.status))
        data = json.loads(result.text())

        docs = []
        for vorgang in data.get("documents", []):
            titel = vorgang.get("titel", "")
            haystack = (titel + " " + " ".join(
                d.get("name", "") for d in vorgang.get("deskriptor", []) or []
            )).lower()
            if not any(k in haystack for k in KEYWORDS):
                continue
            vid = str(vorgang.get("id"))
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id="dip-vorgang-" + vid,
                title=titel[:500],
                detail_url="https://dip.bundestag.de/vorgang/{}".format(vid),
                document_type="LEGISLATIVE_PROPOSAL",
                authority=self.source["authority"],
                jurisdiction="DE",
                publication_date=(vorgang.get("datum") or "")[:10] or None,
                language="de",
                status=vorgang.get("beratungsstand") or "IN_PROGRESS",
                extra={
                    "vorgangstyp": vorgang.get("vorgangstyp"),
                    "initiative": vorgang.get("initiative"),
                    "sachgebiet": vorgang.get("sachgebiet"),
                    "abstract": vorgang.get("abstract"),
                },
            ))
        return docs

    def fetch_url(self, d):
        return None  # Metadaten kommen vollständig aus der API

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("abstract") or None
        doc.status = d.status
        return doc
