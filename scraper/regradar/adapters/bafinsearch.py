"""BaFin-Expertensuche (Servicesuche) nach Format.

Die BaFin-RSS-Feeds (Quelle bafin) liefern Rundschreiben, Meldungen und
Maßnahmen, aber keine Auslegungsentscheidungen, Merkblätter oder
Allgemeinverfügungen und nur einen Teil der Konsultationen. Die
Expertensuche listet jedes Format vollständig: je Treffer Titel + Link,
Erstveröffentlichung ("is-date"), ggf. "geändert am", Thema und Teaser.

Nicht aufgenommen (Nutzerentscheidung 31.10.2026): Meldung und Maßnahme
(kommen über die RSS-Feeds bzw. sind Einzelfälle), Veranstaltung. Als Datum
gilt die Erstveröffentlichung; "geändert am" erzeugt kein neues Update.

Alle Seiten je Format werden bei jedem Lauf gelesen (rund 20 Abrufe à 50
Treffer): Die Liste ist nach Änderungsdatum sortiert, ein Neuzugang mit
altem Erstdatum stünde sonst womöglich nicht auf Seite 1.
"""
import html as html_mod
import re
from typing import List, Optional

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

SEARCH_URL = ("https://www.bafin.de/SiteGlobals/Forms/Suche/Expertensuche/"
              "Servicesuche_Formular.html?cl2Categories_Format={fmt}&pageLocale=de"
              "&sortOrder=searchDate_dt+desc&resultsPerPage=50&gtp=239378_list%253D{page}")
MAX_PAGES = 40  # Sicherung gegen Endlosschleifen; größtes Format (Anlage) hat ~30 Seiten

# Format-Filter der Suche → kanonischer Dokumenttyp
FORMATS = [
    ("auslegungsentscheidung", "ADMINISTRATIVE_PRACTICE"),
    ("merkblatt", "ADMINISTRATIVE_PRACTICE"),
    ("rundschreiben", "CIRCULAR"),
    ("aufsichtsmitteilung", "SUPERVISORY_STATEMENT"),
    ("konsultation", "CONSULTATION"),
    ("verfuegung", "GENERAL_DECISION"),
    ("anlage", "ADMINISTRATIVE_PRACTICE"),
]

# "Anlage" umfasst ~1.500 Formulare und Anhänge. Die BaFin führt dort aber
# auch Auslegungsdokumente, die im Format Auslegungsentscheidung fehlen
# (AuA zum GwG AT 2024 und BT Kreditinstitute 2021). Übernommen werden
# nur Anlagen aus dem Ordner der Auslegungsentscheidungen, ohne nummerierte
# Anhänge, Muster und Vergleichsfassungen.
FORMAT_URL = {"anlage": re.compile(r"/Downloads/DE/Auslegungsentscheidung/")}
FORMAT_SKIP_TITLE = {"anlage": re.compile(r"^(anlage \d|muster\b)|vergleichsversion", re.IGNORECASE)}

LINK_RE = re.compile(r'<a href="(https://www\.bafin\.de/[^"]+)"')
HEADLINE_RE = re.compile(r'(?s)__headline">(.*?)</h3>')
PUB_RE = re.compile(r'is-date">\s*(\d{2})\.(\d{2})\.(\d{4})')
CHANGED_RE = re.compile(r'geändert am:\s*(\d{2})\.(\d{2})\.(\d{4})')
TOPIC_RE = re.compile(r'(?s)__topic-link"[^>]*>(.*?)</a>')
TEASER_RE = re.compile(r'(?s)c-teaser-search-result__text">(.*?)</div>')
DEADLINE_RE = re.compile(r"\bbis (?:zum|spätestens)\s+(\d{1,2})\.(\d{1,2})\.(\d{4})")

# Englische Fassungen (z. B. nationale Q&A zur CRR) spiegeln deutsche
# Dokumente; Stellungnahmen Dritter zu Konsultationen und Formulare sind
# keine Veröffentlichung der Aufsicht.
SKIP_URL = re.compile(r"/Veroeffentlichungen/EN/|/Downloads/EN/", re.IGNORECASE)
# Aufgehobene Dokumente ("MaSI – aufgehoben") lösen nichts mehr aus;
# "teilweise aufgehoben" gilt in Teilen fort und bleibt.
SKIP_TITLE = re.compile(r"^(stellungnahme|formular)|[-–:]\s*stellungnahme\b|"
                        r"(?<!teilweise )\baufgehoben\b", re.IGNORECASE)
# Ganz aufgehoben laut Teaser ("[mit Ablauf des 16.01.2025 aufgehoben]",
# "Das Rundschreiben 4/2015 (BA) wurde am 04.11.2021 aufgehoben"); eine
# Teilaufhebung ("Abschnitt II. 2. … aufgehoben") bleibt.
SKIP_TEASER = re.compile(r"^\[mit ablauf des [^\]]*aufgehoben\]|"
                         r"\b(?:das|dieses) (?:rundschreiben|merkblatt)\b[^.\[]{0,40}? wurde am [\d.]+ aufgehoben",
                         re.IGNORECASE)
REF_RE = re.compile(r"\b(?:Rundschreiben|Aufsichtsmitteilung|Konsultation)\s+(?:Nr\.\s*)?\d{1,2}/\d{4}")


def _strip(fragment: str) -> str:
    # Inline-Tags (<abbr title="Bankenaufsicht">BA</abbr>) ohne Leerzeichen
    # entfernen, sonst entsteht "( BA )" bzw. "Bafin )".
    fragment = re.sub(r"(?i)</?(?:abbr|span|em|strong|b|i)\b[^>]*>", "", fragment)
    return " ".join(re.sub(r"<[^>]+>", " ", html_mod.unescape(fragment)).split())


def _same_doc_key(it: dict) -> tuple:
    """Veröffentlichungs- und Download-Seite desselben Dokuments: gleiches
    Datum und gleiche Kennung ("Konsultation 10/2026") bzw. gleicher
    Titelanfang."""
    m = REF_RE.search(it["title"])
    ident = m.group(0).lower() if m else re.sub(r"\W+", " ", it["title"].lower()).strip()
    return (it["pub"], re.sub(r"\W+", " ", ident).strip())


def _iso(m) -> Optional[str]:
    return "{}-{:0>2}-{:0>2}".format(m.group(3), m.group(2), m.group(1)) if m else None


def parse_results(page: str, doc_type: str) -> List[dict]:
    """Treffer einer Ergebnisseite als Dicts (url, title, pub, changed, topic, teaser)."""
    items = []
    for block in page.split('class="c-teaser-search-result"')[1:]:
        link = LINK_RE.search(block)
        head = HEADLINE_RE.search(block)
        if not link or not head:
            continue
        teaser_m = TEASER_RE.search(block)
        topic_m = TOPIC_RE.search(block)
        items.append({
            "url": link.group(1).split(";")[0].split("?")[0],
            "title": _strip(head.group(1)),
            "pub": _iso(PUB_RE.search(block)),
            "changed": _iso(CHANGED_RE.search(block)),
            "topic": _strip(topic_m.group(1)) if topic_m else None,
            "teaser": _strip(teaser_m.group(1)) if teaser_m else "",
            "type": doc_type,
        })
    return items


class BafinSearchAdapter(SourceAdapter):
    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs = []
        seen = set()
        for fmt, doc_type in FORMATS:
            page_items = []
            for page_no in range(1, MAX_PAGES + 1):
                result, err = http.get(SEARCH_URL.format(fmt=fmt, page=page_no))
                if err or result is None or result.status != 200:
                    raise RuntimeError("BaFin-Suche ({}, Seite {}) nicht erreichbar: {}".format(
                        fmt, page_no, err or (result.status if result else None)))
                items = parse_results(result.text(), doc_type)
                if not items:
                    if page_no == 1:
                        raise RuntimeError("BaFin-Suche ({}) ohne Treffer (Layout geändert?)".format(fmt))
                    break
                page_items.extend(items)
                if len(items) < 50:
                    break
            # Konsultationen: Anhänge (Entwurf, Vergleichsfassung, EBA-Leitlinie)
            # stehen als eigene Download-Treffer am selben Tag — eine
            # Konsultation je Tag. Vorrang: Veröffentlichungsseite, dann ein
            # Download mit "Konsultation" im Titel.
            if fmt == "konsultation":
                key_of = lambda it: (it["pub"],)
                rank = lambda it: ("/Downloads/" in it["url"],
                                   "konsultation" not in it["title"].lower())
            else:
                key_of = _same_doc_key
                rank = lambda it: ("/Downloads/" in it["url"],)
            published = {}
            for it in sorted(page_items, key=rank):
                published.setdefault(key_of(it), it)
            kept = []
            # Download am selben Tag wie genau eine Veröffentlichungsseite des
            # Formats: dieselbe Veröffentlichung unter anderem Titel
            # ("Merkblatt 01/2024 (WA)" vs. "Geschäftsleitung von
            # Wertpapierinstituten: BaFin veröffentlicht Merkblatt").
            pages_by_day = {}
            for it in page_items:
                if "/Downloads/" not in it["url"]:
                    pages_by_day.setdefault(it["pub"], []).append(it)
            for it in page_items:
                lead = published.get(key_of(it))
                day = pages_by_day.get(it["pub"], [])
                if "/Downloads/" in it["url"] and len(day) == 1 and (
                        lead is None or "/Downloads/" in lead["url"]):
                    lead = day[0]
                twin = lead if lead is not it and "/Downloads/" in it["url"] else None
                # Außerhalb der Konsultationen nur in eine Veröffentlichungsseite
                # einfließen lassen: zwei Downloads mit gleichem Titelanfang
                # sind eigenständig (Allgemeinverfügungen Iran / Nordkorea).
                if twin is not None and fmt != "konsultation" and "/Downloads/" in twin["url"]:
                    twin = None
                if twin is not None:
                    # Der Download-Teaser nennt teils die Frist ("bis zum …"),
                    # die Veröffentlichungsseite nur "Konsultation 11/2026".
                    if len(it["teaser"]) > len(twin["teaser"]):
                        twin["teaser"] = it["teaser"]
                    continue
                kept.append(it)
            for it in kept:
                if (it["url"] in seen or SKIP_URL.search(it["url"]) or SKIP_TITLE.search(it["title"])
                        or SKIP_TEASER.search(it["teaser"])):
                    continue
                # Anhänge einer Konsultation tauchen auch unter anderen
                # Formaten auf (Triparty-Repos 2021 als Auslegungsentscheidung);
                # zusammengeführt werden sie nur im Format Konsultation.
                if fmt != "konsultation" and "/Konsultation/" in it["url"]:
                    continue
                if fmt in FORMAT_URL and not FORMAT_URL[fmt].search(it["url"]):
                    continue
                if fmt in FORMAT_SKIP_TITLE and FORMAT_SKIP_TITLE[fmt].search(it["title"]):
                    continue
                seen.add(it["url"])
                if since and it["pub"] and it["pub"] < since:
                    continue
                docs.append(self._candidate(it))
        return docs

    def _candidate(self, it: dict) -> DiscoveredDocument:
        slug = it["url"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
        return DiscoveredDocument(
            source_id=self.source_id,
            # Slug allein ist nicht eindeutig (Veröffentlichungs- und
            # Download-Seite heißen teils gleich): Pfad ab SharedDocs.
            external_id=it["url"].split("/SharedDocs/", 1)[-1].rsplit(".", 1)[0] or slug,
            title=it["title"][:500],
            detail_url=it["url"],
            document_type=it["type"],
            authority=self.source["authority"],
            jurisdiction=self.source["jurisdiction"],
            publication_date=it["pub"],
            language="de",
            status="PUBLISHED",
            extra={"topic": it["topic"], "teaser": it["teaser"], "changed": it["changed"]},
        )

    def fetch_url(self, d: DiscoveredDocument) -> Optional[str]:
        # Teaser und Metadaten stehen in der Trefferliste; den Volltext holt
        # die Zusammenfassung bei Bedarf selbst (fulltext.py). So läuft der
        # Altbestand in einem Lauf ein statt in 25er-Häppchen.
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        teaser = d.extra.get("teaser") or ""
        bits = [b for b in (teaser, "Thema: {}".format(d.extra["topic"]) if d.extra.get("topic") else None) if b]
        doc.summary = " — ".join(bits) or None
        if d.document_type == "CONSULTATION":
            dl = _iso(DEADLINE_RE.search(teaser))
            if dl and (not doc.publication_date or dl >= doc.publication_date):
                doc.consultation_deadline = dl
        m = REF_RE.search(d.title)
        if m:
            doc.reference_number = m.group(0)
        return doc
