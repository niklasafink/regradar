"""Luxemburger Quellen: Legilux (Mémorial A per SPARQL), Chambre des Députés
(Dossiers) und das CSSF-Archiv (Listenseite mit Archivfilter).

Recherche 21.11.2026: Legilux hat keinen RSS-Feed, der SPARQL-Endpunkt
liefert Gesetze live (GET, kein Bot-Schutz). chd.lu hat keinen Feed, die
Dossierseiten sind serverseitig gerendert. Die CSSF-Listenseite
(/en/regulatory-framework/) filtert nach Inhaltstyp und Institutsart und
kennt mit archives=include auch aufgehobene Texte. cssf.lu sperrt die IP
nach rund 70 Abrufen in wenigen Minuten: Listenabrufe daher mit Pause.
"""
import html as _html
import json
import os
import re
import time
from datetime import date, timedelta
from typing import List, Optional
from urllib.parse import urlencode

from .. import http
from ..models import DiscoveredDocument
from .base import SourceAdapter

# ---------------------------------------------------------------- Legilux

SPARQL = "https://data.legilux.public.lu/sparqlendpoint"
LEGILUX_TITLE_RE = (
    "organismes de placement collectif|gestionnaires de fonds|secteur financier|"
    "fonds d.investissement|soci[eé]t[eé] d.investissement|titrisation|blanchiment|"
    "mesures restrictives|abus de march|r[eé]silience op[eé]rationnelle|"
    "march[eé]s de crypto|crypto-actifs|b[eé]n[eé]ficiaires effectifs|"
    "s[eé]curit[eé] des r[eé]seaux|cybers[eé]curit[eé]|lanceurs d.alerte|"
    "sauvegarde du patrimoine|garanties financi|d[eé]mat[eé]rialis|"
    "commission de surveillance du secteur financier|infrastructure de march|"
    "ventes [aà] d[eé]couvert|prospectus|PRIIPs|produits d.investissement"
)
LEGILUX_QUERY = """
PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?act ?title ?date WHERE {{
  ?act a jolux:Act ; jolux:publicationDate ?date ; jolux:isRealizedBy ?e .
  ?e jolux:title ?title .
  FILTER(?date >= "{since}"^^xsd:date)
  FILTER(regex(str(?act), "/eli/etat/leg/(loi|rgd)/"))
  FILTER(regex(?title, "{rx}", "i"))
}} ORDER BY DESC(?date) LIMIT {limit}
"""


class LegiluxAdapter(SourceAdapter):
    limit = 600

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        if not since:
            since = (date.today() - timedelta(days=45)).isoformat()
        query = LEGILUX_QUERY.format(since=since, rx=LEGILUX_TITLE_RE, limit=self.limit)
        url = SPARQL + "?" + urlencode({"query": query})
        result, err = http.get(url, extra_headers={"Accept": "application/sparql-results+json"})
        if err or result is None or result.status != 200:
            raise RuntimeError("Legilux-SPARQL fehlgeschlagen: {}".format(err or result.status))
        try:
            rows = json.loads(result.text())["results"]["bindings"]
        except (ValueError, KeyError) as e:
            raise RuntimeError("Legilux-Antwort ungültig: {}".format(e))
        docs = {}
        for row in rows:
            eli = row["act"]["value"].split("/eli/etat/leg/", 1)[-1]
            eli = re.sub(r"/jo$", "", eli)
            if eli in docs:
                continue
            title = re.sub(r"\s+", " ", row["title"]["value"]).strip()
            kind = eli.split("/", 1)[0]
            docs[eli] = DiscoveredDocument(
                source_id=self.source_id,
                external_id=eli,
                title=title[:500],
                detail_url="https://legilux.public.lu/eli/etat/leg/{}/jo".format(eli),
                document_type="REGULATION" if kind == "rgd" else "LAW",
                authority=self.source["authority"],
                jurisdiction="LU",
                publication_date=row["date"]["value"][:10],
                language="fr",
                status="PUBLISHED",
                extra={"description": title[:1500], "reference": eli},
            )
        return list(docs.values())

    def fetch_url(self, d):
        return None   # Angular-SPA, kein abrufbarer Text

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description")
        return doc


# ------------------------------------------------------------ Chambre (chd)

CHD_STATE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                         "data", "chd_state.json")
CHD_URL = "https://www.chd.lu/fr/dossier/{}"
# Dossiers, die bei der Recherche vom 21.11.2026 für Fondsmanager/Fonds
# einschlägig waren; weitere kommen über den Titelfilter dazu.
CHD_SEED_WATCH = [8814, 8752, 8761, 8370, 8579, 8476]
CHD_SEED_HIGH = 8846
CHD_TITLE_RE = re.compile(
    r"organismes de placement collectif|gestionnaires de fonds|fonds d.investissement|"
    r"secteur financier|titrisation|blanchiment|mesures restrictives|abus de march|"
    r"r[eé]silience op[eé]rationnelle|march[eé]s de crypto|b[eé]n[eé]ficiaires effectifs|"
    r"intelligence artificielle|soci[eé]t[eé] en commandite|"
    r"commission de surveillance du secteur financier|prospectus|ventes [aà] d[eé]couvert|"
    r"s[eé]curit[eé] des r[eé]seaux|lanceurs d.alerte|garanties financi", re.I)


def _text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    return _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", raw)))


def parse_dossier(raw_html: str) -> Optional[dict]:
    """Titel, Status, Datum und Aktivität eines chd.lu-Dossiers; None bei leerer Seite."""
    x = _text(raw_html)
    m = re.search(r"A propos du dossier (?P<title>.+?) Document de d[eé]p[oô]t (?P<nr>\d+) "
                  r"(?P<status>.+?) Derni[eè]re mise [aà] jour", x)
    if not m:
        return None
    dep = re.search(r"Date de d[eé]p[oô]t (\d{2}\.\d{2}\.\d{4})", x)
    upd = re.search(r"Derni[eè]re mise [aà] jour\s*[·.]?\s*(\d{2}\.\d{2}\.\d{4})", x)
    typ = re.search(r"Type (Projet de loi|Proposition de loi|[A-Z][\w ]{3,30}?) Auteur", x)
    avis = re.search(r"Avis (\d+)", x)
    amend = re.search(r"Amendements (\d+)", x)
    return {
        "nr": m.group("nr"), "title": m.group("title").strip(), "status": m.group("status").strip(),
        "deposit": dep.group(1) if dep else None, "updated": upd.group(1) if upd else None,
        "type": typ.group(1) if typ else "Projet de loi",
        "avis": int(avis.group(1)) if avis else 0, "amend": int(amend.group(1)) if amend else 0,
    }


def _iso(dmy: Optional[str]) -> Optional[str]:
    if not dmy:
        return None
    d, m, y = dmy.split(".")
    return "{}-{}-{}".format(y, m, d)


class ChdAdapter(SourceAdapter):
    """Beobachtet Gesetzentwürfe: neue Dossiernummern oberhalb des höchsten
    bekannten plus alle einschlägigen Dossiers (Statuswechsel, Avis, Änderungsanträge)."""
    scan_ahead = 14
    max_gap = 8

    def _load_state(self) -> dict:
        try:
            with open(CHD_STATE, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {"high": CHD_SEED_HIGH, "watch": list(CHD_SEED_WATCH)}

    def _save_state(self, state: dict) -> None:
        os.makedirs(os.path.dirname(CHD_STATE), exist_ok=True)
        with open(CHD_STATE, "w", encoding="utf-8") as f:
            json.dump(state, f)

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        state = self._load_state()
        high, watch = int(state["high"]), set(int(n) for n in state["watch"])
        docs, misses, n = [], 0, high
        for n in range(high + 1, high + 1 + self.scan_ahead * 4):
            result, err = http.get(CHD_URL.format(n))
            info = parse_dossier(result.text()) if result is not None and result.status == 200 else None
            if not info:
                misses += 1
                if misses >= self.max_gap:
                    break
                continue
            misses = 0
            high = max(high, n)
            if CHD_TITLE_RE.search(info["title"]):
                watch.add(n)
        for n in sorted(watch):
            result, err = http.get(CHD_URL.format(n))
            if err or result is None or result.status != 200:
                continue
            info = parse_dossier(result.text())
            if not info:
                continue
            desc = ("{type} Nr. {nr}, Stand: {status}. Eingebracht am {dep}, letzte Aktualisierung {upd}. "
                    "Gutachten: {avis}, Änderungsanträge: {amend}.").format(
                        type=info["type"], nr=info["nr"], status=info["status"], dep=info["deposit"],
                        upd=info["updated"], avis=info["avis"], amend=info["amend"])
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id="dossier/{}".format(n),
                title=info["title"][:500],
                detail_url=CHD_URL.format(n),
                document_type="BILL",
                authority=self.source["authority"],
                jurisdiction="LU",
                publication_date=_iso(info["deposit"]),
                language="fr",
                status=info["status"][:60],
                extra={"description": desc, "reference": "Dossier {}".format(n)},
            ))
        state["high"], state["watch"] = high, sorted(watch)
        self._save_state(state)
        return docs

    def fetch_url(self, d):
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.reference_number = d.extra.get("reference")
        doc.summary = d.extra.get("description")
        return doc


# ----------------------------------------------------------- CSSF-Archiv

CSSF_LIST = "https://www.cssf.lu/en/regulatory-framework/"
# Institutsarten mit Fondsbezug (Filter entity_type) und Inhaltstypen
# (Filter content_type); die IDs stammen aus dem Formular der Listenseite.
CSSF_ENTITIES = {9746: "IFM", 502: "AIFM", 2001: "ManCo15", 2035: "ManCo16", 14: "Fonds",
                 486: "UCITS", 490: "TeilII", 496: "SICAR", 494: "SIF"}
CSSF_TYPES = {567: "CIRCULAR", 575: "REGULATION", 585: "LAW", 553: "LAW", 1483: "Q_AND_A"}
CSSF_ITEM_RE = re.compile(r'<li class="library-element">(.*?)</li>\s*(?=<li class="library-element">|</ul>)', re.S)


def parse_cssf_list(page_html: str) -> list:
    out = []
    for blk in CSSF_ITEM_RE.findall(page_html):
        dt = re.search(r'date--published">Published on (\d{2})\.(\d{2})\.(\d{4})', blk)
        a = re.search(r'library-element__title"><a href="([^"]+)">(.*?)</a>', blk, re.S)
        st = re.search(r'library-element__subtitle">\s*<p>(.*?)</p>', blk, re.S)
        if not (dt and a):
            continue
        clean = lambda s: _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()
        out.append({
            "date": "{}-{}-{}".format(dt.group(3), dt.group(2), dt.group(1)),
            "url": a.group(1), "title": clean(a.group(2)),
            "subtitle": clean(st.group(1)) if st else "",
        })
    return out


class CssfArchiveAdapter(SourceAdapter):
    """Alle Fonds-Rundschreiben, -Verordnungen, -Gesetze und -FAQs der CSSF, auch
    aufgehobene (archives=include). Der RSS-Feed liefert nur die letzten 20 je Typ."""
    pause = 4.0
    max_pages = 30

    def discover(self, since: Optional[str] = None) -> List[DiscoveredDocument]:
        since = since or (date.today() - timedelta(days=75)).isoformat()
        seen = {}
        for ent in CSSF_ENTITIES:
            for typ, dtype in CSSF_TYPES.items():
                for page in range(1, self.max_pages + 1):
                    q = urlencode({"content_type": typ, "entity_type": ent, "archives": "include"})
                    url = CSSF_LIST + ("page/{}/".format(page) if page > 1 else "") + "?" + q
                    time.sleep(self.pause)
                    result, err = http.get(url)
                    if err or result is None or result.status != 200:
                        if page == 1 and (result is None or result.status != 404):
                            raise RuntimeError("CSSF-Liste nicht erreichbar: {}".format(err or result.status))
                        break
                    items = parse_cssf_list(result.text())
                    if not items:
                        break
                    stop = False
                    for it in items:
                        if it["date"] < since:
                            stop = True
                            continue
                        key = it["url"]
                        if key not in seen:
                            seen[key] = (it, dtype)
                    if stop:
                        break
        docs = []
        for url, (it, dtype) in seen.items():
            title = re.sub(r"\s+repealed by.*$", "", it["title"]).strip()
            ext = url.rstrip("/")
            full = "https://www.cssf.lu" + url if url.startswith("/") else url
            docs.append(DiscoveredDocument(
                source_id=self.source_id,
                external_id=ext,
                title=title[:500],
                detail_url=full,
                document_type=dtype,
                authority=self.source["authority"],
                jurisdiction="LU",
                publication_date=it["date"],
                language="en",
                status="REPEALED" if re.search(r"repealed by", it["title"], re.I) else "PUBLISHED",
                extra={"description": it["subtitle"], "reference": None},
            ))
        return docs

    def fetch_url(self, d):
        return None

    def normalize(self, d, raw_content):
        doc = super().normalize(d, raw_content)
        doc.summary = d.extra.get("description") or None
        return doc
