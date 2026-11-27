"""Schweizer Quellen (jur "CH"): FINMA (News-Feed, Dokumentenlisten, laufende
Anhörungen), News Service Bund (Fachämter), SIX Exchange Regulation, OAK BV,
AMAS und Fedlex (SPARQL).

Recherche 28.11.2026, nur öffentliche, dafür vorgesehene Zugänge:
- FINMA: offizieller RSS-Feed https://www.finma.ch/de/rss/news/ (50 Einträge,
  Medienmitteilungen, Sanktionsmeldungen, Reden). Die Dokumentenlisten
  (Rundschreiben, Aufsichtsmitteilungen) lädt die Seite per POST an
  /de/api/search/getresult nach (Parameter ds=<Quelle>, Order=<n>): derselbe
  Aufruf wie im Browser. Laufende Anhörungen stehen serverseitig im HTML.
- News Service Bund: offizieller RSS-Feed des Bundes (newsd.admin.ch/newsd/feeds/rss),
  der alle Ämter bündelt (sif/seco/bacs/bsv/edoeb tragen kein eigenes Feed).
- SIX Exchange Regulation: die Seiten laden JSON `<Komponente>.results.json`.
- OAK BV: Weisungen/Mitteilungen serverseitig im HTML.
- AMAS: Medienmitteilungen serverseitig im HTML (Zirkulare sind Mitgliederbereich).
- Fedlex: offener SPARQL-Endpunkt, Ontologie JOLUX (wie Legilux).
Bei 403/429 sofort abbrechen, nie umgehen.
"""
import html as _html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from .. import USER_AGENT, http
from ..models import DiscoveredDocument
from .base import SourceAdapter

PAUSE = 2.5   # Sekunden zwischen Listenabrufen


def _clean(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", _html.unescape(s)).replace("\xa0", " ").strip()


def _dmy(s: Optional[str]) -> Optional[str]:
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s or "")
    if not m:
        return None
    return "{}-{:02d}-{:02d}".format(m.group(3), int(m.group(2)), int(m.group(1)))


def _post_form(url: str, data: dict, headers: Optional[dict] = None):
    """POST mit Formulardaten, gleicher Takt und User-Agent wie http.get.
    Rückgabe (text, fehler)."""
    http._throttle(url)
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest"}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode("utf-8"),
                                 headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=http.TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace"), None
    except urllib.error.HTTPError as e:
        return None, "HTTP {} für {}".format(e.code, url)
    except Exception as e:   # URLError, Timeout …
        return None, "{}: {}".format(type(e).__name__, e)


def _get_json(url: str, headers: Optional[dict] = None):
    result, err = http.get(url, extra_headers=headers or {"Accept": "application/json"})
    if err or result is None or result.status != 200:
        raise RuntimeError("Abruf fehlgeschlagen: {}".format(err or (result.status if result else "?")))
    return json.loads(result.text())


# ----------------------------------------------------------------- FINMA

FINMA = "https://www.finma.ch"
FINMA_API = FINMA + "/de/api/search/getresult"
# (Datenquelle ds, Order, Dokumenttyp, Auslöser) aus data-source/data-order der Seiten
FINMA_LISTS = [
    ("{3009DAA1-E9A3-4CF1-B0F0-8059B9A37AFA}", "2", "CIRCULAR", "Rundschreiben"),
    ("{ED0E8A7F-25EA-4DB1-B53B-C2327A435359}", "4", "SUPERVISORY_STATEMENT", "Aufsichtsmitteilung"),
]
FINMA_ANHOERUNGEN = FINMA + "/de/dokumentation/anhoerungen/laufende-anhoerungen/"


def _finma_url(link: str) -> str:
    """Absolute URL ohne Sprachpräfix-Zusätze und ohne Hash-Parameter
    (kuratierte Einträge in data.ts führen die Datei-URL ohne Query)."""
    path = link.split("?", 1)[0]
    return FINMA + path if path.startswith("/") else path


def parse_finma_items(payload: dict, doc_type: str, source_id: str, authority: str) -> List[DiscoveredDocument]:
    docs = []
    for it in payload.get("Items", []):
        link = it.get("Link") or ""
        iso = _dmy(it.get("Date"))
        title = _clean(it.get("Title"))
        if not link or not title or not iso:
            continue
        url = _finma_url(link)
        desc = _clean(it.get("Description"))
        ref = None
        m = re.match(r"^(\d{4}/\d{2})\s", title)
        if m:
            ref = "RS " + m.group(1)
        m = re.search(r"Aufsichtsmitteilung\s+(\d{2}/\d{4})", title)
        if m:
            ref = "Aufsichtsmitteilung " + m.group(1)
            title = "FINMA-Aufsichtsmitteilung {}: {}".format(m.group(1), desc) if desc else title
        docs.append(DiscoveredDocument(
            source_id=source_id,
            external_id=urllib.parse.urlparse(url).path,
            title=title[:500],
            detail_url=url,
            document_url=url,
            document_type=doc_type,
            authority=authority,
            jurisdiction="CH",
            publication_date=iso,
            language="de",
            status="PUBLISHED",
            extra={"description": desc, "reference": ref},
        ))
    return docs


def parse_finma_anhoerungen(page_html: str) -> list:
    """Entwürfe aus der Seite 'laufende Anhörungen': Teaser mit Titel 'Entwurf: …'
    und 'Zuletzt geändert: TT.MM.JJJJ'."""
    out = []
    for blk in re.split(r'<div class="document-teaser-box">', page_html)[1:]:
        t = re.search(r'document-teaser-box-title"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        d = re.search(r"Zuletzt ge.ndert:\s*(\d{2}\.\d{2}\.\d{4})", blk)
        if not (t and d):
            continue
        title = _clean(t.group(2))
        if not re.match(r"(?i)entwurf", title):
            continue
        out.append({"url": _finma_url(_html.unescape(t.group(1))), "title": title, "date": _dmy(d.group(1))})
    return out


class FinmaDocsAdapter(SourceAdapter):
    """Rundschreiben und Aufsichtsmitteilungen (seitenindizierte JSON-Suche) plus
    laufende Anhörungen (HTML)."""
    max_pages = 5

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs = {}
        for ds, order, dtype, _ in FINMA_LISTS:
            url, skip = FINMA_API, 0
            for _ in range(self.max_pages):
                time.sleep(PAUSE)
                body, err = _post_form(url, {"ds": ds, "Order": order})
                if err or body is None:
                    raise RuntimeError("FINMA-Liste nicht abrufbar: {}".format(err))
                try:
                    payload = json.loads(body)
                except ValueError as e:
                    raise RuntimeError("FINMA-Antwort ungültig: {}".format(e))
                found = parse_finma_items(payload, dtype, self.source_id, self.source["authority"])
                for d in found:
                    docs.setdefault(d.external_id, d)
                nxt = payload.get("NextPageLink")
                if not nxt or not found or (since and found[-1].publication_date and found[-1].publication_date < since):
                    break
                url = FINMA + nxt if nxt.startswith("/") else nxt
                # Folgeseiten tragen die Datenquelle schon im Skip-Link: weiter mit POST
        time.sleep(PAUSE)
        result, err = http.get(FINMA_ANHOERUNGEN)
        if err or result is None or result.status != 200:
            raise RuntimeError("FINMA-Anhörungen nicht abrufbar: {}".format(err or (result.status if result else "?")))
        for it in parse_finma_anhoerungen(result.text()):
            ext = urllib.parse.urlparse(it["url"]).path
            docs.setdefault(ext, DiscoveredDocument(
                source_id=self.source_id, external_id=ext, title=it["title"][:500],
                detail_url=it["url"], document_url=it["url"], document_type="CONSULTATION",
                authority=self.source["authority"], jurisdiction="CH", publication_date=it["date"],
                language="de", status="PUBLISHED", extra={"description": "", "reference": None}))
        out = list(docs.values())
        if since:
            out = [d for d in out if not d.publication_date or d.publication_date >= since]
        return out

    def fetch_url(self, d):
        return None   # PDFs bleiben extern; Metadaten genügen

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description") or None
        return doc


# ------------------------------------------------- News Service Bund (Fachämter)

NSB_FEED = ("https://www.newsd.admin.ch/newsd/feeds/rss?lang=de&org-nr=1&topic=&keyword="
            "&offer-nr=&catalogueElement=&kind=M&start_date={since}")
# Starke Begriffe zählen in Titel und Teaser, schwache nur im Titel. Das Feed
# bündelt alle Bundesämter; die eigentliche Zuordnung erledigen SOURCE_RULES.
NSB_STRONG = re.compile(
    r"finanzmarkt|finanzdienstleist|finanzinstitut|fidleg|finig|kollektivanlage|bankengesetz|"
    r"geldw[aä]sch|terrorismusfinanzierung|wirtschaftlich berechtigt|transparenz juristischer|"
    r"\bfinma\b|krypto|stablecoin|versicherungsaufsicht|berufliche vorsorge|\bbvg\b|"
    r"vorsorgeeinrichtung|too big to fail|systemrelevante|einlagensicherung|sanktionspaket|embargo", re.I)
NSB_WEAK = re.compile(
    r"\bbanken?\b|sanktion|cyber|datenschutz|k[uü]nstliche intelligenz|b[oö]rse|kapitalmarkt|"
    r"meldepflicht|\be-id\b|informationsaustausch|s[aä]ule 3a|pensionskasse|eigenmittel|"
    r"informationssicherheit|nachhaltigkeitsbericht|finanzplatz", re.I)
NSB_NOISE = re.compile(
    r"fussball|olympi|tourismus|landwirtschaft|strassen|verteidigung|armee|"
    r"öffentliche warnung|rückruf|lebensmittel|arbeitsmarkt|bundesratsreise|"
    r"von-wattenwyl|treffen mit|besuch|abkommen mit|staatsbesuch|gipfel|konferenz|"
    r"medienlunch|forum|preisverleihung|statistik", re.I)

NSB_LEGAL = re.compile(r"vernehmlassung|botschaft|verordnung|gesetz|anhörung", re.I)


def parse_nsb(xml_bytes: bytes, source_id: str, authority_default: str = "Bundesverwaltung") -> List[DiscoveredDocument]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        raise RuntimeError("NSB-Feed ungültig: {}".format(e))
    docs = []
    for item in root.iter("item"):
        def txt(name):
            el = item.find(name)
            return (el.text or "").strip() if el is not None else ""
        title, link, desc, author = txt("title"), txt("link"), txt("description"), txt("author")
        pub = (txt("pubDate") or "")[:10]
        if not (title and link and re.match(r"\d{4}-\d{2}-\d{2}$", pub)):
            continue
        hay = "{} {}".format(title, desc)
        if (NSB_NOISE.search(title) and not NSB_LEGAL.search(title)) or not (NSB_STRONG.search(hay) or NSB_WEAK.search(title)):
            continue
        nsb_id = urllib_path_tail(link)
        docs.append(DiscoveredDocument(
            source_id=source_id,
            external_id=nsb_id,
            title=title[:500],
            detail_url=link,
            document_type="OTHER",
            authority=author or authority_default,
            jurisdiction="CH",
            publication_date=pub,
            language="de",
            status="PUBLISHED",
            extra={"description": desc[:1500], "reference": None},
        ))
    return docs


def urllib_path_tail(url: str) -> str:
    return urllib.parse.urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]


class NsbAdapter(SourceAdapter):
    """Medienmitteilungen des Bundes (SIF, SECO, BACS, BSV, EDÖB, BJ, Bundesrat),
    gefiltert auf Finanzmarkt- und Compliance-Themen."""
    default_days = 30

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        start = since or (date.today() - timedelta(days=self.default_days)).isoformat()
        result, err = http.get(NSB_FEED.format(since=start), extra_headers={"Accept": "application/rss+xml, */*"})
        if err or result is None or result.status != 200:
            raise RuntimeError("News Service Bund nicht abrufbar: {}".format(err or (result.status if result else "?")))
        return parse_nsb(result.content, self.source_id)

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("description") or None
        if raw_content:
            from .base import strip_html
            doc.full_text = strip_html(raw_content.decode("utf-8", errors="replace"))[:200000]
        return doc

    def fetch_url(self, d):
        return None   # Nuxt-Seite, Teaser aus dem Feed genügt


# ------------------------------------------------------ SIX Exchange Regulation

SIX_BASE = "https://www.ser-ag.com"
SIX_LISTS = [
    # (JSON-Komponente, Dokumenttyp)
    (SIX_BASE + "/de/resources/notifications/regulatory-communication/_jcr_content/root/"
     "contentparsys/parsys/assets_taxonomy_filt.results.json", "SUPERVISORY_STATEMENT"),
    (SIX_BASE + "/de/resources/notifications/media-releases/_jcr_content/root/"
     "contentparsys/parsys/page_taxonomy_filter.results.json", "OTHER"),
]
# Einzelfälle der Handelsüberwachung/Offenlegungsstelle sind kein Rahmenwerk-Update.
SIX_EINZELFALL = re.compile(
    r"dekotierung|sanktionsbescheid|untersuchung in sachen|schliesst untersuchung|"
    r"suspendierung\b(?!.*(richtlinie|reglement))|jahresbericht", re.I)


def parse_six(payload: dict, doc_type: str, source_id: str, authority: str) -> List[DiscoveredDocument]:
    docs = []
    for r in payload.get("results", []):
        url, title = r.get("url") or "", _clean(r.get("title"))
        ts = r.get("publicationDate")
        if not url or not title or not ts:
            continue
        if SIX_EINZELFALL.search(title):
            continue
        iso = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc).astimezone().strftime("%Y-%m-%d")
        desc = _clean(r.get("description"))
        full_title = "{}: {}".format(title, desc) if desc else title
        docs.append(DiscoveredDocument(
            source_id=source_id,
            external_id=r.get("abbreviation") or urllib.parse.urlparse(url).path,
            title=full_title[:500],
            detail_url=url,
            document_url=url if url.endswith(".pdf") else None,
            document_type=doc_type,
            authority=authority,
            jurisdiction="CH",
            publication_date=iso,
            language="de",
            status="PUBLISHED",
            extra={"description": desc, "reference": r.get("abbreviation")},
        ))
    return docs


class SixAdapter(SourceAdapter):
    """Regulatorische Mitteilungen und Medienmitteilungen von SIX Exchange Regulation."""

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs = {}
        for url, dtype in SIX_LISTS:
            time.sleep(PAUSE)
            try:
                payload = _get_json(url)
            except (RuntimeError, ValueError) as e:
                raise RuntimeError("SIX-Liste nicht abrufbar: {}".format(e))
            for d in parse_six(payload, dtype, self.source_id, self.source["authority"]):
                docs.setdefault(d.external_id, d)
        out = list(docs.values())
        if since:
            out = [d for d in out if not d.publication_date or d.publication_date >= since]
        return out

    def fetch_url(self, d):
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description") or None
        return doc


# ----------------------------------------------------------------- OAK BV

OAK_BASE = "https://www.oak-bv.admin.ch"
OAK_PAGES = [("/de/weisungen", "Weisung"), ("/de/mitteilungen", "Mitteilung")]
OAK_CARD_RE = re.compile(
    r"(?P<title>[^|]{8,300}?)\s*\|\s*(?P<ref>[WM] – \d{2}/\d{4})\s*\|\s*"
    r"(?P<ver>Erstversion|Überarbeitete Version)\s*\|\s*(?P<date>\d{2}\.\d{2}\.\d{4})")


def parse_oak(page_html: str) -> list:
    """Karten der Listenseiten: 'Titel, W – 01/2026, Erstversion, 22.04.2026, Mehr über «…»'
    mit Link /de/weisungen-w-… bzw. /de/mitteilungen-m-…"""
    out, seen = [], set()
    marked = re.sub(r'<a[^>]+href="(/de/(?:weisungen|mitteilungen)-[a-z]-[^"]+)"[^>]*>',
                    lambda m: " @@{}@@ ".format(m.group(1)), page_html)
    marked = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", marked)
    text = _clean(re.sub(r"<[^>]+>", "|", marked).replace("|", " | "))
    text = re.sub(r"(\s*\|\s*)+", " | ", text)
    for m in re.finditer(r"@@(/de/[^@]+)@@", text):
        href = m.group(1)
        if href in seen:
            continue
        before = text[max(0, m.start() - 420):m.start()]
        cards = list(OAK_CARD_RE.finditer(before))
        if not cards:
            continue
        c = cards[-1]
        seen.add(href)
        out.append({"href": href, "title": c.group("title").strip(" |"), "ref": c.group("ref"),
                    "ver": c.group("ver"), "date": _dmy(c.group("date"))})
    return out


class OakAdapter(SourceAdapter):
    """Weisungen und Mitteilungen der Oberaufsichtskommission Berufliche Vorsorge."""

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        docs = {}
        for path, kind in OAK_PAGES:
            time.sleep(PAUSE)
            result, err = http.get(OAK_BASE + path)
            if err or result is None or result.status != 200:
                raise RuntimeError("OAK-BV-Liste nicht abrufbar: {}".format(err or (result.status if result else "?")))
            for it in parse_oak(result.text()):
                ref = it["ref"].replace(" – ", " ")
                title = "OAK BV {} {} ({}): {}".format(kind, ref, it["ver"], it["title"])
                docs.setdefault(it["href"], DiscoveredDocument(
                    source_id=self.source_id, external_id=it["href"].strip("/"),
                    title=title[:500], detail_url=OAK_BASE + it["href"],
                    document_type="GUIDELINE" if kind == "Weisung" else "SUPERVISORY_STATEMENT",
                    authority=self.source["authority"], jurisdiction="CH",
                    publication_date=it["date"], language="de", status="PUBLISHED",
                    extra={"description": it["title"], "reference": ref}))
        out = list(docs.values())
        if since:
            out = [d for d in out if not d.publication_date or d.publication_date >= since]
        return out

    def fetch_url(self, d):
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description") or None
        return doc


# ------------------------------------------------------------------- AMAS

AMAS_URL = "https://www.am-switzerland.ch/de/medien-positionen/medien/medienmitteilungen"
MONTHS = {m: i + 1 for i, m in enumerate(
    ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september",
     "oktober", "november", "dezember"])}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]


def parse_amas(page_html: str) -> list:
    """Medienmitteilungen: <h3>Titel</h3><p><strong>Basel, 19. November 2026 – …"""
    out = []
    for m in re.finditer(r"<h3[^>]*>(.*?)</h3>\s*<p><strong>([^<]{0,80}?(\d{1,2})\.\s+([A-Za-zäöü]+)\s+(\d{4}))\s*[–-]\s*(.*?)</strong>",
                         page_html, re.S):
        mon = MONTHS.get(m.group(4).lower())
        if not mon:
            continue
        out.append({"title": _clean(m.group(1)),
                    "date": "{}-{:02d}-{:02d}".format(m.group(5), mon, int(m.group(3))),
                    "lead": _clean(m.group(6))})
    return out


class AmasAdapter(SourceAdapter):
    """Medienmitteilungen der Asset Management Association Switzerland. Zirkulare
    liegen im Mitgliederbereich und werden nicht abgerufen."""

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        result, err = http.get(AMAS_URL)
        if err or result is None or result.status != 200:
            raise RuntimeError("AMAS nicht abrufbar: {}".format(err or (result.status if result else "?")))
        docs = []
        for it in parse_amas(result.text()):
            if since and it["date"] < since:
                continue
            slug = _slug(it["title"])
            docs.append(DiscoveredDocument(
                source_id=self.source_id, external_id="{}-{}".format(it["date"], slug),
                title=it["title"][:500], detail_url="{}#{}".format(AMAS_URL, slug),
                document_type="OTHER", authority=self.source["authority"], jurisdiction="CH",
                publication_date=it["date"], language="de", status="PUBLISHED",
                extra={"description": it["lead"][:1500], "reference": None}))
        return docs

    def fetch_url(self, d):
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("description") or None
        return doc


# ----------------------------------------------------------------- Fedlex

FEDLEX_SPARQL = "https://fedlex.data.admin.ch/sparqlendpoint"
FEDLEX_ELI = "https://fedlex.data.admin.ch/eli/cc/"
# Erlass-URI (ohne Präfix) -> (SR-Nummer, Kurzname). Nummern und URIs am
# 28.11.2026 über jolux:historicalLegalId bzw. den Titel geprüft.
FEDLEX_ACTS = {
    "2019/758": ("950.1", "FIDLEG"),
    "2019/759": ("950.11", "FIDLEV"),
    "2018/801": ("954.1", "FINIG"),
    "2019/763": ("954.11", "FINIV"),
    "2006/822": ("951.31", "KAG"),
    "2006/859": ("951.311", "KKV"),
    "1998/892_892_892": ("955.0", "GwG"),
    "2015/791": ("955.01", "GwV"),
    "2015/390": ("955.033.0", "GwV-FINMA"),
    "51/117_121_129": ("952.0", "BankG"),
    "2014/273": ("952.02", "BankV"),
    "2012/629": ("952.03", "ERV"),
    "2012/883": ("952.06", "LiqV"),
    "2005/734": ("961.01", "VAG"),
    "2005/735": ("961.011", "AVO"),
    "1983/797_797_797": ("831.40", "BVG"),
    "1984/543_543_543": ("831.441.1", "BVV 2"),
    "2015/853": ("958.1", "FinfraG"),
    "2015/854": ("958.11", "FinfraV"),
    "2008/736": ("956.1", "FINMAG"),
    "2022/491": ("235.1", "DSG"),
    "2022/568": ("235.11", "DSV"),
    "2002/564": ("946.231", "EmbG"),
    # Ukraine-Verordnung (2022/151) und Belarus-Verordnung (2022/172) bewusst nicht
    # enthalten: jede Änderung der Personenlisten (Anhang 8) erzeugt eine neue
    # Fassung. Sanktionspakete kommen über die Bundesrat-Meldungen (ch_admin) und
    # die FINMA-Sanktionsnews.
    "2022/232": ("128", "ISG"),
    "2025/169": ("", "Cybersicherheitsverordnung"),
    "2026/323": ("", "TJPG"),
    "2026/364": ("", "TJPV"),
}
FEDLEX_QUERY = """
PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?work ?c ?app ?created (MIN(?pub) AS ?pubdate) WHERE {{
  VALUES ?work {{ {works} }}
  ?c jolux:isMemberOf ?work ; jolux:dateApplicability ?app .
  OPTIONAL {{ ?c dct:created ?created }}
  OPTIONAL {{ ?c jolux:publicationDate ?pub }}
  FILTER((?app >= "{since}"^^xsd:date || STR(?created) >= "{since}") && ?app <= "{until}"^^xsd:date)
}} GROUP BY ?work ?c ?app ?created ORDER BY DESC(?app) LIMIT 800
"""


def parse_fedlex(payload: dict, source_id: str, authority: str) -> List[DiscoveredDocument]:
    docs = []
    for b in payload["results"]["bindings"]:
        work = b["work"]["value"].replace(FEDLEX_ELI, "")
        cons = b["c"]["value"].replace(FEDLEX_ELI, "")
        sr, short = FEDLEX_ACTS.get(work, ("", work))
        app = b["app"]["value"][:10]
        pub = (b.get("pubdate", {}).get("value") or b.get("created", {}).get("value") or app)[:10]
        y, m, d = app.split("-")
        label = "{} (SR {})".format(short, sr) if sr else short
        title = "{}: neue Fassung gilt ab {}.{}.{}".format(label, int(d), int(m), y)
        docs.append(DiscoveredDocument(
            source_id=source_id,
            external_id=cons,
            title=title,
            detail_url="https://www.fedlex.admin.ch/eli/cc/{}/de".format(cons),
            document_type="LAW",
            authority=authority,
            jurisdiction="CH",
            publication_date=pub,
            language="de",
            status="PUBLISHED",
            extra={"description": "Konsolidierte Fassung von {} in Kraft ab {}. "
                                  "Fedlex-Veröffentlichung der Änderung: {}.".format(label, app, pub),
                   "reference": "SR " + sr if sr else None, "in_force": app},
        ))
    return docs


class FedlexAdapter(SourceAdapter):
    """Neue konsolidierte Fassungen der einschlägigen Bundeserlasse (ein SPARQL-Aufruf)."""
    default_days = 60

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        since = since or (date.today() - timedelta(days=self.default_days)).isoformat()
        # Fassungen, die erst in Jahren gelten (Platzhalter für gestaffelte
        # Inkraftsetzung), sind kein Update.
        until = (date.today() + timedelta(days=730)).isoformat()
        works = " ".join("<{}{}>".format(FEDLEX_ELI, w) for w in FEDLEX_ACTS)
        url = FEDLEX_SPARQL + "?" + urllib.parse.urlencode({"query": FEDLEX_QUERY.format(works=works, since=since, until=until)})
        result, err = http.get(url, extra_headers={"Accept": "application/sparql-results+json"})
        if err or result is None or result.status != 200:
            raise RuntimeError("Fedlex-SPARQL fehlgeschlagen: {}".format(err or (result.status if result else "?")))
        try:
            payload = json.loads(result.text())
        except ValueError as e:
            raise RuntimeError("Fedlex-Antwort ungültig: {}".format(e))
        return parse_fedlex(payload, self.source_id, self.source["authority"])

    def fetch_url(self, d):
        return None   # Fedlex ist eine SPA, kein abrufbarer Text

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description")
        return doc
