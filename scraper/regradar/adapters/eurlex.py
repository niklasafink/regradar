"""EUR-Lex-Adapter über den öffentlichen CELLAR-SPARQL-Endpunkt.

Discovery: Rechtsakte (VO, RL, delegierte/Durchführungs-VO) der letzten
Tage mit CELEX-Nummer und deutschem (Fallback: englischem) Titel.
Stabile ID: CELEX.
"""
import json
from datetime import date, timedelta
from typing import List, Optional
from urllib.parse import urlencode

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql"

RESOURCE_TYPES = {
    "REG": "REGULATION",
    "DIR": "DIRECTIVE",
    "REG_DEL": "DELEGATED_REGULATION",
    "REG_IMPL": "IMPLEMENTING_REGULATION",
}

QUERY_TEMPLATE = """
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?celex ?title ?date ?rt WHERE {{
  ?work cdm:resource_legal_id_celex ?celex ;
        cdm:work_date_document ?date ;
        <http://publications.europa.eu/ontology/cdm#work_has_resource-type> ?rt .
  VALUES ?rt {{ {types} }}
  ?expr cdm:expression_belongs_to_work ?work ;
        cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/{lang}> ;
        cdm:expression_title ?title .
  FILTER(?date >= "{since}"^^xsd:date)
}}
ORDER BY DESC(?date)
LIMIT {limit}
"""


class EurLexAdapter(SourceAdapter):
    limit = 60

    def _run_query(self, since: str, lang: str) -> Optional[list]:
        types = " ".join(
            "<http://publications.europa.eu/resource/authority/resource-type/{}>".format(t)
            for t in RESOURCE_TYPES
        )
        query = QUERY_TEMPLATE.format(types=types, since=since, limit=self.limit, lang=lang)
        url = SPARQL_ENDPOINT + "?" + urlencode({
            "query": query,
            "format": "application/sparql-results+json",
        })
        result, err = http.get(url)
        if err or result is None or result.status != 200:
            raise RuntimeError("CELLAR SPARQL fehlgeschlagen: {}".format(err or result.status))
        try:
            data = json.loads(result.text())
        except ValueError as e:
            raise RuntimeError("CELLAR-Antwort kein JSON: {}".format(e))
        return data.get("results", {}).get("bindings", [])

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        if not since:
            since = (date.today() - timedelta(days=14)).isoformat()
        rows = self._run_query(since, "DEU")
        language = "de"
        if not rows:
            rows = self._run_query(since, "ENG")
            language = "en"

        docs = {}
        for row in rows:
            celex = row["celex"]["value"]
            if celex in docs:
                continue
            rt_uri = row["rt"]["value"]
            rt_code = rt_uri.rsplit("/", 1)[-1]
            docs[celex] = DiscoveredDocument(
                source_id=self.source_id,
                external_id=celex,
                title=row["title"]["value"][:500],
                detail_url="https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:" + celex,
                document_url="https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:" + celex,
                document_type=RESOURCE_TYPES.get(rt_code, "OTHER"),
                authority=self.source["authority"],
                jurisdiction="EU",
                publication_date=row["date"]["value"][:10],
                language=language,
                status="PUBLISHED",
            )
        return list(docs.values())

    def fetch_url(self, d):
        # Die HTML-Renderings von eur-lex.europa.eu leiten für viele Akte auf
        # Index-Seiten um und blocken Nicht-Browser-Clients (403). Volltext
        # später über CELLAR-Manifestationen; MVP bleibt metadaten-basiert.
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.external_id  # CELEX
        return doc
