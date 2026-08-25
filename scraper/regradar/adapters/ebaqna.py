"""EBA-Single-Rulebook-Q&A-Adapter.

Die Q&A-Suche ist eine Drupal-View ohne öffentliche JSON-API; Discovery
parst die Listenseite /single-rule-book-qa/all (sortiert nach
Antwort-Veröffentlichungsdatum, neueste zuerst). Stabile ID: publicId
(z. B. 2026_7940). Je Teaser: Titel + Fragetext, Rechtsakt ("Legal act"),
Topic sowie Einreichungs-/Veröffentlichungsdatum und Status
(Final/Rejected).
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

BASE = "https://www.eba.europa.eu"
LINK_RE = re.compile(
    r'href="(/single-rule-book-qa/qna/view/publicId/(\d{4}_\d+))"[^>]*>\s*(.*?)</a>', re.S)
QUESTION_RE = re.compile(r'(?s)teaser-qa__question">\s*(.*?)</p>')
LEGAL_ACT_RE = re.compile(r'(?s)<b>Legal act:\s*</b>\s*(.*?)</li>')
TOPIC_RE = re.compile(r'(?s)<b>Topic:\s*</b>\s*(.*?)</li>')
SUBMITTED_RE = re.compile(r'<b>Date of submission:\s*</b>\s*<time datetime="(\d{4}-\d{2}-\d{2})')
PUBLISHED_RE = re.compile(r'<b>Published as ([^:<]+):\s*</b>\s*(\d{2})/(\d{2})/(\d{4})')


def _strip(fragment: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html_mod.unescape(fragment)).split())


class EbaQnaAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(self.source["discovery_url"])
        if err or result is None or result.status != 200:
            raise RuntimeError("EBA-Q&A-Liste nicht erreichbar: {}".format(err))
        page = result.text()

        docs = []
        seen = set()
        for block in re.split(r'class="views-row"', page)[1:]:
            m = LINK_RE.search(block)
            if not m:
                continue
            public_id = m.group(2)
            if public_id in seen:
                continue
            seen.add(public_id)

            pub = None
            status = "SUBMITTED"
            pm = PUBLISHED_RE.search(block)
            if pm:
                status = _strip(pm.group(1)).upper().replace(" Q&A", "")
                pub = "{}-{}-{}".format(pm.group(4), pm.group(3), pm.group(2))
            else:
                sm = SUBMITTED_RE.search(block)
                if sm:
                    pub = sm.group(1)
            if since and pub and pub < since:
                continue

            question = QUESTION_RE.search(block)
            legal_act = LEGAL_ACT_RE.search(block)
            topic = TOPIC_RE.search(block)
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=public_id,
                title=_strip(m.group(3))[:500],
                detail_url=BASE + m.group(1),
                document_type="Q_AND_A",
                authority=self.source["authority"],
                jurisdiction=self.source["jurisdiction"],
                publication_date=pub,
                language="en",
                status=status,
                extra={
                    "question": _strip(question.group(1)) if question else None,
                    "legal_act": _strip(legal_act.group(1)) if legal_act else None,
                    "topic": _strip(topic.group(1)) if topic else None,
                },
            ))
        if not docs:
            raise RuntimeError("EBA-Q&A-Liste ohne erkennbare Einträge (Layout geändert?)")
        return docs

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.external_id
        parts = []
        if d.extra.get("question"):
            q = d.extra["question"]
            parts.append(q[:240] + (" …" if len(q) > 240 else ""))
        # Rechtsakt/Topic anhängen: liefert dem Framework-Mapping die
        # Regime-Signale (CRR, PSD2 …), die im Fragetitel oft fehlen.
        if d.extra.get("legal_act"):
            parts.append("Legal act: {}".format(d.extra["legal_act"]))
        if d.extra.get("topic"):
            parts.append("Topic: {}".format(d.extra["topic"]))
        doc.summary = " — ".join(parts) or None
        if raw_content:
            from .base import strip_html
            doc.full_text = strip_html(raw_content.decode("utf-8", errors="replace"))[:200000]
        return doc
