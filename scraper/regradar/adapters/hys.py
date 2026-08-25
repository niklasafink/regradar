"""Have-Your-Say-Adapter (Europäische Kommission, „Better Regulation").

EU-Frühwarnsignal analog DIP: geplante Initiativen, Roadmaps und offene
Feedback-Perioden der Kommission, lange bevor ein Rechtsakt in EUR-Lex
erscheint. Zugriff über die öffentliche JSON-API (brpapi/searchInitiatives),
abgefragt mit Finanz-Suchbegriffen. Stabile ID: Initiative-ID.
Nur Metadaten; die Initiative-Seiten sind eine JS-App und werden nicht
gefetcht.
"""
import json
from typing import List, Optional
from urllib.parse import quote

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

API = ("https://ec.europa.eu/info/law/better-regulation/brpapi/"
       "searchInitiatives?text={query}&language=EN&page=0&size=30")
DETAIL = "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/{id}"

QUERIES = [
    "banking", "insurance", "payment services", "securities markets",
    "anti-money laundering", "investment funds", "financial services",
]


def _date(value: Optional[str]) -> Optional[str]:
    # API-Format: "2026/09/17 23:59:59"
    if not value or len(value) < 10:
        return None
    return value[:10].replace("/", "-")


class HysAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs = []
        seen = set()
        errors = 0
        for query in QUERIES:
            result, err = http.get(API.format(query=quote(query)))
            if err or result is None or result.status != 200:
                errors += 1
                continue
            try:
                page = json.loads(result.content.decode("utf-8"))
            except ValueError:
                errors += 1
                continue
            for item in (page.get("initiativeResultDtoPage") or {}).get("content", []):
                init_id = str(int(item.get("id", 0)))
                if not init_id or init_id in seen:
                    continue
                seen.add(init_id)

                current = None
                for st in item.get("currentStatuses") or []:
                    if st.get("isCurrent"):
                        current = st
                        break
                feedback_open = bool(current and current.get("receivingFeedbackStatus") == "OPEN")
                pub = _date(current.get("feedbackStartDate")) if current else None
                if since and pub and pub < since:
                    continue

                title = (item.get("shortTitle") or "").strip()
                if not title:
                    continue
                docs.append(DiscoveredDocument(
                    source_id=self.source_id,
                    external_id=init_id,
                    title=title[:500],
                    detail_url=DETAIL.format(id=init_id),
                    document_type="CONSULTATION" if feedback_open else "LEGISLATIVE_PROPOSAL",
                    authority="Europäische Kommission",
                    jurisdiction="EU",
                    publication_date=pub,
                    language="en",
                    status=item.get("initiativeStatus") or None,
                    extra={
                        "reference": item.get("reference"),
                        "stage": (current or {}).get("frontEndStage"),
                        "deadline": _date((current or {}).get("feedbackEndDate")) if feedback_open else None,
                    },
                ))
        if not docs and errors:
            raise RuntimeError("Have-Your-Say-API nicht erreichbar ({} Fehler)".format(errors))
        docs.sort(key=lambda d: d.publication_date or "", reverse=True)
        return docs

    def fetch_url(self, d):
        return None  # JS-App, kein archivierbares Original

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.consultation_deadline = d.extra.get("deadline")
        stage = d.extra.get("stage")
        if stage:
            doc.summary = "Verfahrensstand: {}".format(stage.replace("_", " ").title())
        return doc
