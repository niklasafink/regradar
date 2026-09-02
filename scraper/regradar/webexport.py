"""Export der gescrapten Dokumente für das Next.js-Frontend.

Ordnet echte Regulatory Events per Schlüsselwort-Mapping den Rahmenwerken
der Web-App zu (web/lib/data.ts) und schreibt web/lib/live.json.
High-Level-Prinzip: nur Titel, Typ, Datum, Behörde, ggf. Frist und der
Link auf die Primärquelle – keine Volltexte.
"""
import json
import os
import re
import sqlite3
from typing import Optional
from urllib.parse import urlparse

WEB_LIVE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "web", "lib", "live.json")

WEB_SOURCES_PATH = os.path.join(os.path.dirname(WEB_LIVE_PATH), "sources.json")

MAX_PER_FRAMEWORK = 6

# Reihenfolge wichtig: spezifische Regime vor generischen prüfen.
FRAMEWORK_RULES = [
    # WpI MaRisk (Wertpapierinstitute) und KAMaRisk (KVGen) sind eigenständige
    # Regelwerke – nicht die Banken-MaRisk nach § 25a KWG.
    ("wpimarisk", r"wpi[\s-]*marisk|marisk\b[\s\S]*wertpapierinstitut|wertpapierinstitut[\s\S]*\bmarisk\b"),
    ("aifmd2", r"kamarisk|\bka[\s-]+marisk\b|marisk\b[\s\S]*kapitalverwaltung|kapitalverwaltung[\s\S]*\bmarisk\b"),
    # ZAG-MaRisk (RS 07/2024 BA) für Zahlungs- und E-Geld-Institute.
    ("zagmarisk", r"zag[\s-]*marisk|marisk\b[\s\S]*(zag-institut|zahlungsinstitut|e-geld-institut|zahlungs- und e-geld)|"
                  r"(zag-institut|zahlungsinstitut|e-geld-institut|zahlungs- und e-geld)[\s\S]*\bmarisk\b"),
    ("marisk", r"\bmarisk\b"),
    ("macomp", r"\bmacomp\b|compliance-funktion|mindestanforderungen an die compliance"),
    ("instvergv", r"institutsvergütungsverordnung|institutsvergv|wpi-vergv|vergütungsverordnung|"
                  r"vergütungssystem|remuneration polic|sound remuneration|risikoträger|material risk taker|"
                 r"\bivv\b|wpi-vergütungsverordnung|vergütungsregel|remuneration guideline"),
    ("anacredit", r"anacredit|kreditdatenstatistik"),
    ("instant", r"echtzeitüberweisung|instant (payment|credit transfer)|verification of payee|"
               r"\bipr\b|instant payments regulation|sepa instant|sepa-echtzeit"),
    # DLT-Pilotregelung vor MiCA: Kryptowertpapiere/DLT-Marktinfrastrukturen
    # sind Finanzinstrumente und fallen gerade nicht unter MiCA.
    ("dltpilot", r"dlt[\s-]*pilot|pilot[\s-]*regime|pilotregelung|"
                 r"distributed[\s-]*ledger|\bdlt\b|"
                 r"kryptowertpapier|crypto securit|elektronische[sn]? wertpapier|\bewpg\b|"
                 r"tokenisier|tokeni[sz](ed|ation)"),
    ("mica", r"\bmica\b|kryptowert|crypto-?asset|"
            r"\bmicar\b|markets in crypto-?assets|kryptowerte-verordnung|\bcasps?\b|kryptoverwahr|stablecoin|krypto-dienstleist"),
    ("eltif", r"\beltif\b|euveca|"
             r"european long-term investment|europäische[rn]? langfristige[rn]? investmentfonds"),
    ("mmf", r"geldmarktfonds|money market fund|"
           r"\bmmfr\b|money market"),
    ("ecspr", r"\becspr\b|crowdfunding|crowdinvest|crowdlend|schwarmfinanzier|"
             r"schwarmfinanzierungs|crowdfunding-verordnung"),
    ("priips", r"\bpriips\b|basisinformationsblatt|key information document|"
              r"\bkids?\b|packaged retail"),
    ("hinschg", r"hinweisgeber|whistleblow|"
               r"whistleblower|meldestelle|whistleblowing-richtlinie"),
    ("complaints", r"beschwerdemanagement|beschwerdeabwicklung|complaints?-handling|complaints? handling|beschwerderegister|"
                  r"complaints management|beschwerdeverfahren"),
    ("lksg", r"lieferkette|\blksg\b|\bcsddd\b|supply chain due diligence|sorgfaltspflichten von unternehmen"),
    ("aiact", r"ki-verordnung|\bai act\b|artificial intelligence act|künstliche intelligenz|\bki-modell|general.purpose ai|\bgpai\b|\b[ak]i[- ]omnibus\b|transparency of ai-generated|\bai office\b|ai-gesetz|"
             r"\bai-act\b|\bki-vo\b|ki-gesetz|ai regulation|artificial intelligence regulation|\bki-system|hochrisiko-ki|high-risk ai"),
    ("eidas2", r"\beidas\b|eudi[- ]wallet|digital identity wallet|elektronische identifizierung|vertrauensdienst|trust service|"
              r"eidas 2|eidas-2|elektronische signatur|electronic signature|qualifizierte[rn]? vertrauensdienst"),
    ("dora", r"\bdora\b|digital operational resilience|ikt-drittdienstleister|"
            r"dora-verordnung|ikt-vorfall|ict incident|ict-related incident|threat-led penetration|\btlpt\b|register of information|informationsregister"),
    ("nis2", r"\bnis-?2\b|bsi-gesetz|\bbsig\b|"
            r"network and information security|cybersicherheitsrichtlinie|nis-2-umsetzung"),
    ("fida", r"\bfida\b|financial data access|open finance|zugang zu finanzdaten|"
            r"fida-verordnung|finanzdatenzugang|financial data sharing"),
    ("bfsg", r"barrierefreiheit|\bbfsg\b|accessibility act|european accessibility"),
    ("crs", r"\bdac ?8\b|common reporting standard|finanzkonten-informationsaustausch|\bfkaustg\b|"
            r"kryptowerte-steuertransparenz|\bksttg\b|\bfatca\b|crypto-asset reporting framework|\bcarf\b"),
    ("csdr", r"\bcsdr\b|\bt\+1\b|zentralverwahrer|central securities depositor|abwicklungszyklus|settlement cycle|settlement discipline|"
            r"csdr refit|settlement efficiency|abwicklungseffizienz|wertpapierabwicklung|securities settlement"),
    ("dgsd", r"einlagensicherung|deposit guarantee|deposit insurance|\bdgsd\b|\beinsig\b|\bcmdi\b|"
            r"sicherungssystem|entschädigungseinrichtung|einlagensicherungsgesetz|deposit protection"),
    ("prospectus", r"\bprospekt|prospectus|listing act|wertpapier-informationsblatt"),
    ("tfr", r"geldtransfer-?verordnung|transfer of funds|travel rule|transfers of crypto|"
           r"\btfr\b|geldtransferverordnung"),
    ("sanctions", r"finanzsanktion|financial sanction|sanktionspaket|sanctions package|embargo|"
                  r"sanktionsdurchsetzung|sanktionsliste|restriktive maßnahmen|restrictive measures|"
                  r"außenwirtschaftsgesetz|\bawg\b|\bawv\b|einfrieren von geldern|asset freez|"
                 r"sanktionen gegen|sanctions against|russland-sanktion|russia sanction|\bofac\b|iran-sanktion|iran sanction"),
    ("amla", r"\bamla\b|\bamlar\b|anti-money laundering authority|geldwäscheverordnung"),
    ("gwg", r"geldwäsche|money laundering|\bgwg\b|\bfiu\b|terrorismusfinanzierung|financial crime|"
           r"\baml\b|\bamld\b|\bcft\b|anti-money laundering|\bkyc\b|know your customer|wirtschaftlich berechtigt|beneficial owner|transparenzregister|geldwäscherichtlinie"),
    ("itsrep", r"\bcorep\b|\bfinrep\b|meldewesen|reporting framework|validation rules|meldebögen|taxonomie 4|supervisory reporting|"
              r"\bdpm\b|reporting taxonomy|meldeverordnung|\bxbrl\b|meldepflichten für institute"),
    # Versicherungs-Sanierung/-Abwicklung (IRRD) vor der Banken-BRRD.
    ("irrd", r"\birrd\b|recovery and resolution of insurance|recovery and resolution of \(re\)insurance|"
             r"insurance recovery and resolution|sanierung und abwicklung von versicherung|"
             r"versicherungssanierung|pre-emptive recovery plan|präventiver sanierungsplan"),
    ("brrd", r"\bbrrd\b|\bmrel\b|abwicklungsfähigkeit|bank recovery|abwicklungsrichtlinie|\bsrb\b|sanierungsplan|sanierungs- und abwicklung|single resolution|resolvability|resolution planning|crisis management|\bcmdi\b|"
            r"bail-in|abwicklungsbehörde|resolution authority|abwicklungsfonds|resolution fund"),
    ("ifr", r"\bifr\b|\bifd\b|wertpapierinstitut"),
    ("outsourcing", r"auslagerung|outsourcing|"
                   r"third-party (risk|provider|service)|drittparteien|fremdvergabe"),
    ("mar", r"marktmissbrauch|market abuse|insider|"
           r"ad-hoc-publizität|ad-hoc-mitteilung|ad hoc disclosure|marktmanipulation|market manipulation|directors.? dealings|eigengeschäfte von führungskräften"),
    ("emir", r"\bemir\b|otc-derivat|otc derivative|clearingpflicht|clearing obligation|"
             r"central counterpart|\bccps?\b|transaktionsregister|trade repositor|"
             r"einschusspflicht|margin requirement|active account|"
            r"emir 3|emir-refit|emir refit|derivatemeldung|derivatives reporting|clearing house"),
    ("bmr", r"benchmark-?verordnung|benchmark regulation|referenzwert|"
            r"kritische[nrs]? benchmark|critical benchmark|significant benchmark|"
            r"\beuribor\b|€str|euro short-term rate|"
           r"\blibor\b|\bsofr\b|\bsonia\b|ibor-ablösung|ibor transition"),
    ("mifid", r"\bmifid\b|\bmifir\b|wertpapierdienstleistung|consolidated tape|anlageberatung|best execution|"
             r"wertpapierhandelsgesetz|\bwphg\b|geeignetheit|suitability|product governance|produktfreigabe|zielmarkt|target market|zuwendung|inducement|retail investment strategy|kleinanlegerstrategie|mifid ii|mifid 2"),
    # Deutsches ZAG-Recht vor dem generischen PSD-Muster: Merkblatt, ZAG-
    # Verordnungen und Erlaubnisfragen sind nationale Auslegung, keine PSD3.
    ("zkg", r"zahlungskontengesetz|\bzkg\b|basiskonto|kontowechsel|entgeltinformation|entgeltaufstellung|"
            r"payment accounts directive|basic payment account|account switching"),
    ("interchange", r"interbankenentgelt|interchange fee|\bifr\b(?=[\s\S]*(kart|card))"),
    ("zag", r"\bzag\b|zahlungsdiensteaufsichtsgesetz|zag-anzeigenverordnung|zaganzv|"
            r"zag-instituts-eigenmittel|\bziev\b|zag-monatsausweis|sicherungsanforderungen|"
            r"finanztransfergeschäft|kontoinformationsdienst|e-geld-institut|zahlungsinstitut|"
           r"zahlungsinstitutsgesetz|erlaubnis nach dem zag|zag-erlaubnis|e-geld-geschäft|e-money institution"),
    ("psd3", r"\bpsd[23]\b|zahlungsdienst|payment service|"
            r"\bpsr\b|payment services regulation|zahlungsdiensterichtlinie|starke kundenauthentifizierung|strong customer authentication|\bsca\b|open banking|zahlungsauslösedienst"),
    ("aifmd2", r"\baifmd\b|\bkagb\b|\bogaw\b|\bucits\b|investmentfonds|investment fund|kapitalverwaltung|\baif\b|"
              r"alternative investment fund|\bkvgs?\b|verwahrstelle|depositar|ogaw-richtlinie|ucits directive|spezialfonds|publikumsfonds|kreditfonds|loan-originating"),
    ("csrd", r"\bcsrd\b|\besrs\b|nachhaltigkeitsbericht|sustainability report|corporate sustainability report|"
            r"\bvsme\b|esg-bericht|nachhaltigkeitsberichterstattung|csrd-umsetzung|omnibus.{0,40}nachhaltigkeit"),
    ("sfdr", r"\bsfdr\b|offenlegungsverordnung|sustainab|nachhaltigkeitsbezogen|\besg\b|taxonomie-verordnung|taxonomy regulation|"
            r"taxonomy disclosures|taxonomie-offenlegung|taxonomy-related disclosure|taxonomiebezogene|"
            r"greenwashing|klimarisik|climate risk|eu-taxonomie|eu taxonomy|\bpais?\b|principal adverse impact|nachhaltigkeitspräferenz|sustainability preference"),
    ("solvency", r"solvency|solvabilität|versicherungsaufsicht|\bvag\b|\biorp\b|occupational retirement|insurance stress test|reinsurance|"
                r"solvency ii|solvency 2|solvabilität ii|\borsa\b|\bscr\b|solvenzkapital|versicherungsunternehmen|insurance undertaking|rückversicher"),
    ("idd", r"versicherungsvertrieb|insurance distribution|"
           r"versicherungsvermittl|insurance intermediar|\bibips?\b|versicherungsanlageprodukt|insurance-based investment|versicherungsmakler"),
    ("ebaict", r"ict (and security )?risk|ikt-risik"),
    ("crr3", r"\bcrr\b|\bcrd\b|eigenmittel|\bbasel\b|output floor|own funds|kapitalpuffer|capital requirement|"
            r"basel (iii|iv|3|4)|kreditrisiko|credit risk|liquidity coverage|\blcr\b|\bnsfr\b|leverage ratio|verschuldungsquote|\bkwg\b|kreditwesengesetz|\bsrep\b|\bicaap\b|\bilaap\b|bankenpaket|banking package|eigenkapitalanforderung|risikogewichtete|risk-weighted"),
    # Generische Muster bewusst am Ende, damit Spezialregime zuerst greifen.
    ("dsgvo", r"datenschutz|\bdsgvo\b|\bgdpr\b|data protection|\bbdsg\b|personenbezogene daten|personal data|"
             r"privacy|datenschutz-grundverordnung|auftragsverarbeit|datenpanne|data breach|\bdsfa\b|\bdpia\b|\bcookies?\b|einwilligung|consent management"),
    # Absatzfinanzierungsaufsichtsgesetz (BNPL/Händlerkredite) vor dem
    # generischen Verbraucherkredit-Muster.
    ("absfinag", r"absatzfinanzierungsaufsichtsgesetz|\babsfinag\b|absatzfinanzier|\bbnpl\b"),
    ("consumer", r"verbraucherdarlehen|verbraucherkredit|consumer credit|\bccd\b|restschuldversicherung|verbrauchervertr|widerrufsinformation|buy.now.pay.later|finanzieller verbraucherschutz|"
                r"verbraucherschutz|consumer protection|verbraucherkreditrichtlinie|\bccd ?(ii|2)\b|widerrufsrecht|right of withdrawal|prämiensparvertr|kontoentgelt|dispozins|überziehungszins"),
]

TYPE_LABELS = {
    "CIRCULAR": ("Rundschreiben", "Circular"),
    "CONSULTATION": ("Konsultation", "Consultation"),
    "GUIDELINE": ("Leitlinien", "Guidelines"),
    "RTS": ("RTS", "RTS"),
    "ITS": ("ITS", "ITS"),
    "Q_AND_A": ("Q&A", "Q&A"),
    "FINAL_REPORT": ("Final Report", "Final report"),
    "GENERAL_DECISION": ("Allgemeinverfügung", "General decision"),
    "ADMINISTRATIVE_PRACTICE": ("Auslegung", "Guidance"),
    "SUPERVISORY_STATEMENT": ("Mitteilung", "Statement"),
    "REGULATION": ("Verordnung", "Regulation"),
    "DIRECTIVE": ("Richtlinie", "Directive"),
    "DELEGATED_REGULATION": ("Delegierte VO", "Delegated regulation"),
    "IMPLEMENTING_REGULATION": ("Durchführungs-VO", "Implementing regulation"),
    "LAW": ("Gesetz", "Law"),
    "LEGISLATIVE_PROPOSAL": ("Gesetzentwurf", "Bill"),
    "COURT_DECISION": ("Urteil", "Court decision"),
    "OTHER": ("Meldung", "News"),
}


# Aufsichtspraxis: Einzelfall-Maßnahmen (Bußgelder, Verwarnungen, Zwangs-
# gelder …) sind keine regulatorischen Updates (NOISE greift), aber ein
# Praxis-Signal — sie landen als eigener "praxis"-Bestand in live.json
# (Seite /praxis; monatlich aggregierter Newsletter).
PRAXIS_RULES = [
    ("bussgeld", r"geldbu(ß|ss)e|bu(ß|ss)geld"),
    ("zwangsgeld", r"zwangsgeld"),
    ("verwarnung", r"verwarn"),
]
PRAXIS_WINDOW_DAYS = 365
# Harte Obergrenze: Die BaFin muss eigene Maßnahme-Bekanntmachungen fünf
# Jahre nach Veröffentlichung löschen (u. a. § 125 Abs. 5 WpHG, § 60b
# Abs. 4 KWG). Der Praxis-Export darf deshalb nie Einträge zeigen, die
# älter sind — egal wie groß PRAXIS_WINDOW_DAYS künftig gewählt wird.
PRAXIS_LEGAL_MAX_DAYS = 5 * 365
PRAXIS_MAX = 120


def _praxis_summary(text: Optional[str], limit: int = 360) -> str:
    """Gescrapte Beschreibung für den Praxis-Bestand: ganze Sätze bis ~limit
    Zeichen, damit Begründung und Betragshöhe lesbar ankommen statt mitten im
    Wort abzubrechen."""
    cleaned = _clean(text, 10_000)
    if len(cleaned) <= limit:
        return cleaned
    # Satzgrenzen nur an Satzzeichen MIT folgendem Leerraum: Punkte in
    # Zahlen ("16.000 Euro") oder Abkürzungen ohne Leerzeichen dürfen den
    # Text nicht zerreißen (sonst bleibt z. B. "000 Euro festgesetzt" übrig).
    out = ""
    for part in re.split(r"(?<=[.!?])\s+", cleaned):
        if out and len(out) + len(part) + 1 > limit:
            break
        out = (out + " " + part).strip()
    return out or _clean(cleaned, limit)


def _praxis_category(text: str, url: str = "") -> Optional[str]:
    lowered = text.lower()
    for cat, pattern in PRAXIS_RULES:
        if re.search(pattern, lowered):
            return cat
    # BaFin-Maßnahmenseiten (anonymisierte Maßnahmen nach § 60b KWG u. a.)
    # tragen die Kategorie im URL-Pfad, nicht immer im Titel.
    if "/massnahmen/" in (url or "").lower():
        return "massnahme"
    return None


# Kein regulatorisches Änderungssignal: Warnungen vor unerlaubten Anbietern,
# Einzelfall-Maßnahmen, Veranstaltungen, Personalien, Newsletter.
NOISE = re.compile(
    r"warnt\s+(?:\w+\s+)?vor|warnungen?\s+vor|betrüger|phishing|"
    r"identitätsmissbrauch|unerlaubte|newsletter|roundtable|"
    r"speaking|speaks?\b|keynote|speech|interview|visits?\b|konferenz|conference|"
    r"moderates|appears before|sets out vision|\bsummit\b|"
    r"call for papers|vacanc|appoint|ernennung|"
    r"geldbuße|bußgeld|zwangsgeld|verwarnt|workshop|webinar|anmeldung|"
    r"tragic incident|condolence|stakeholder group|stakeholder event|photo gallery|"
    r"anordnung über die vertretung|vertretung der bundesrepublik|"
    r"stellenausschreibung|management board meeting", re.IGNORECASE)


def _classify(text: str, forced: Optional[str] = None) -> Optional[str]:
    if NOISE.search(text):
        return None
    if forced:
        return forced
    lowered = text.lower()
    for fw_id, pattern in FRAMEWORK_RULES:
        if re.search(pattern, lowered):
            return fw_id
    return None


def _de_date(iso: Optional[str]) -> Optional[str]:
    if not iso or not re.match(r"\d{4}-\d{2}-\d{2}", iso):
        return None
    y, m, d = iso[:10].split("-")
    return "{}.{}.{}".format(d, m, y)


def _domain(url: str) -> str:
    host = urlparse(url or "").netloc
    return host[4:] if host.startswith("www.") else host


def _slugify(s: str) -> str:
    """Python-Port von slugify() in web/lib/updates.ts – muss identisch
    slugifizieren, damit exportierte Slugs zu bestehenden URLs passen."""
    import unicodedata
    s = s.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80].rstrip("-")


def _clean(text: Optional[str], limit: int = 280) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + " …"
    return text


def export_sources(path: Optional[str] = None) -> dict:
    """Schreibt die angebundenen Quellen (Registry) als web/lib/sources.json.

    Das Frontend (Footer + /quellen) rendert daraus die Quellenliste; der
    Export läuft bei jedem `export` mit, damit die Liste aktuell bleibt.
    """
    from .db import utcnow
    from .registry import SOURCES

    path = path or WEB_SOURCES_PATH
    sources = [
        {
            "id": s["source_id"],
            "name": s["name"],
            "authority": s["authority"],
            "jurisdiction": s["jurisdiction"],
            "access": s["discovery_type"],
            "url": s["base_url"],
        }
        for s in SOURCES
        if s.get("enabled")
    ]
    payload = {"generated_at": utcnow(), "sources": sources}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return {"path": path, "sources": len(sources)}


def export_web(conn: sqlite3.Connection, path: Optional[str] = None) -> dict:
    path = path or WEB_LIVE_PATH
    sources_info = export_sources()
    from .dedup import ensure_tables as dedup_tables
    dedup_tables(conn)
    rows = conn.execute(
        """SELECT document_id, source_id, external_id, authority, title, document_type,
                  status, publication_date, consultation_deadline, canonical_url, summary,
                  reference_number, first_seen_at
           FROM documents
           WHERE source_id NOT IN ('gii', 'rii')
             AND document_id NOT IN
                 (SELECT item_id FROM dedup_suppressed WHERE kind='document')
           ORDER BY COALESCE(publication_date, substr(first_seen_at, 1, 10)) DESC""").fetchall()

    # Aufsichtspraxis-Bestand (Bußgelder, Verwarnungen, Maßnahmen …): läuft
    # als eigene Liste in live.json — bewusst ohne Rahmenwerk, LLM-Summary
    # und Impact, mit Originaltitel, gescrapter Kurzbeschreibung (Hintergrund/
    # Betragshöhe) und Link auf die Primärquelle.
    from datetime import date as _pdate, timedelta as _ptd
    praxis_cutoff = (_pdate.today() - _ptd(
        days=min(PRAXIS_WINDOW_DAYS, PRAXIS_LEGAL_MAX_DAYS))).isoformat()
    praxis = []
    praxis_raws = []  # Rohtexte parallel zu praxis, für die KI-Prüfroutine
    seen_praxis = set()
    for r in rows:
        cat = _praxis_category(
            "{} {}".format(r["title"] or "", r["summary"] or ""),
            r["canonical_url"] or "")
        if not cat:
            continue
        iso = r["publication_date"] or (r["first_seen_at"] or "")[:10]
        date = _de_date(iso)
        if not date or iso < praxis_cutoff:
            continue
        key = (re.sub(r"\W+", " ", (r["title"] or "").lower()).strip(), date)
        if key in seen_praxis:
            continue
        seen_praxis.add(key)
        entry = {
            "d": date,
            "ti": _clean(r["title"], 200),
            "auth": r["authority"] or _domain(r["canonical_url"]),
            "src": _domain(r["canonical_url"]),
            "url": r["canonical_url"],
            "cat": cat,
        }
        summary = _praxis_summary(r["summary"])
        if summary:
            entry["sum"] = summary
        praxis.append(entry)
        praxis_raws.append(r["summary"])
    praxis = praxis[:PRAXIS_MAX]
    praxis_raws = praxis_raws[:PRAXIS_MAX]

    # KI-Prüfroutine: gescrapte Praxis-Kurztexte vor der Veröffentlichung
    # per LLM auf Textfehler prüfen (abgeschnittene Sätze/Zahlen, Artefakte)
    # und beanstandete Texte aus dem Rohtext reparieren (gecacht).
    from .qacheck import check_praxis
    qa_stats = check_praxis(conn, praxis, praxis_raws)

    # Kandidaten sammeln (Regex-Vorfilter + Rahmenwerk-Zuordnung + Datum) …
    candidates = []
    for r in rows:
        # AMLA-Einträge ohne extrahiertes Seitendatum sind Slug-Platzhalter
        # (Seite noch nicht geladen) – für den High-Level-Feed auslassen.
        if r["source_id"] == "amla" and not r["publication_date"]:
            continue
        # Dokumente der AMLA-Website gehören immer zum AMLA-Rahmenwerk;
        # Titel wie "Consultation on the draft RTS on Customer Due
        # Diligence" nennen weder Behörde noch Stichworte eindeutig.
        fw_id = _classify(
            "{} {}".format(r["title"] or "", r["summary"] or ""),
            forced="amla" if r["source_id"] == "amla" else None)
        if not fw_id:
            continue
        date = _de_date(r["publication_date"]) or _de_date(r["first_seen_at"][:10])
        if not date:
            continue
        candidates.append((r, fw_id, date))

    # … dann per LLM auf regulatorische Relevanz prüfen (gecacht; ohne
    # OPENROUTER_API_KEY gelten alle Kandidaten als relevant).
    from .llmfilter import api_key, classify as llm_classify
    relevance = llm_classify(conn, [
        (r["document_id"], "{} – {}".format(_clean(r["title"], 200), _clean(r["summary"])))
        for r, _, _ in candidates])

    from .big4 import related_articles

    # Erst auswählen (Relevanz + Kappung je Rahmenwerk), dann nur für die
    # tatsächlich exportierten Einträge LLM-Zusammenfassungen erzeugen.
    # Einträge mit noch offener Frist (Konsultationen) haben Vorrang vor
    # datumsneueren Meldungen, damit laufende Fristen die Kappung überleben.
    from datetime import date as _date
    today_iso = _date.today().isoformat()

    def _deadline_open(r):
        dl = r["consultation_deadline"]
        return bool(dl and dl[:10] >= today_iso)

    selected = []
    per_fw = {}
    seen_titles = set()  # Netz und doppelter Boden neben dedup_suppressed
    for prio in (True, False):
        for r, fw_id, date in candidates:
            if _deadline_open(r) is not prio:
                continue
            if not relevance.get(r["document_id"], True):
                continue
            if per_fw.get(fw_id, 0) >= MAX_PER_FRAMEWORK:
                continue
            title_key = (fw_id, re.sub(r"\W+", " ", (r["title"] or "").lower()).strip())
            if title_key in seen_titles:
                continue
            seen_titles.add(title_key)
            per_fw[fw_id] = per_fw.get(fw_id, 0) + 1
            selected.append((r, fw_id, date))

    # Big-4-/Kanzlei-Beiträge vor der Zusammenfassung ermitteln, damit deren
    # Titel als Relevanz-Kontext in die LLM-Zusammenfassung einfließen können.
    adv_by_doc = {}
    for r, fw_id, _ in selected:
        adv_by_doc[r["document_id"]] = related_articles(
            conn, r["document_id"], fw_id,
            "{} – {}".format(_clean(r["title"], 200), _clean(r["summary"])),
            doc_date=(r["publication_date"] or r["first_seen_at"] or "")[:10] or None)

    # Gemeinsamer Kontext für LLM-Zusammenfassung und LLM-Impact-Einstufung.
    contexts = [
        (r["document_id"],
         "Titel: {}\nTyp: {}\nBehörde: {}\nDatum: {}{}{}\nTeaser: {}{}".format(
             _clean(r["title"], 300),
             r["document_type"] or "OTHER",
             r["authority"] or _domain(r["canonical_url"]),
             date,
             "\nKonsultationsfrist: {}".format(_de_date(r["consultation_deadline"]))
             if _de_date(r["consultation_deadline"]) else "",
             "\nReferenz: {}".format(r["reference_number"])
             if r["reference_number"] else "",
             _clean(r["summary"], 1000) or "(kein Teaser)",
             "\nFachbeiträge dazu: {}".format("; ".join(
                 "{}: {}".format(a["f"], a["ti"])
                 for a in adv_by_doc[r["document_id"]]))
             if adv_by_doc[r["document_id"]] else ""))
        for r, _, date in selected]

    # Für die Zusammenfassung zusätzlich die Original-URL mitgeben: summarize
    # ruft den Volltext der Primärquelle ab (fulltext.py), damit der Inhalt
    # der Meldung stimmt und nicht nur auf dem Teaser basiert.
    urls = {r["document_id"]: r["canonical_url"] for r, _, _ in selected}
    from .summarize import summarize
    summaries = summarize(conn, [(i, t, urls[i]) for i, t in contexts])

    # Impact-Urteil per LLM nach den Regeln in scraper/IMPACT.md; ohne
    # Urteil greift im Frontend die Dokumenttyp-Heuristik (logic.ts).
    from .impact import assess
    impacts = assess(conn, contexts)

    updates = {}
    matched = 0
    advisory = 0
    summarized = 0
    for r, fw_id, date in selected:
        bucket = updates.setdefault(fw_id, [])
        de, en = TYPE_LABELS.get(r["document_type"], TYPE_LABELS["OTHER"])
        title = _clean(r["title"], 200)
        # Verständliche Zusammenfassung (bis zu 3 Absätze) aus dem LLM;
        # Fallback ist der bereinigte Original-Teaser.
        llm = summaries.get(r["document_id"])
        if llm:
            summarized += 1
        summary = _clean(r["summary"])
        # Verständliche Titel bleiben laut DESIGN.md in Originalsprache;
        # kryptische (Regel-IDs, Aktenzeichen) ersetzt der beschreibende
        # LLM-Anzeigetitel. Der Slug ("sl") bleibt am Original-Titel
        # verankert, damit URLs und Newsletter-Dedup stabil bleiben.
        ti = (llm or {}).get("ti") or {"de": title, "en": title}
        entry = {
            "d": date,
            "t": {"de": de, "en": en},
            "src": _domain(r["canonical_url"]),
            "ti": ti,
            "sl": _slugify(title),
            "s": {"de": llm["de"], "en": llm["en"]} if llm
                 else {"de": summary, "en": summary},
            "url": r["canonical_url"],
        }
        imp = impacts.get(r["document_id"])
        if imp:
            entry["imp"] = imp
        deadline = _de_date(r["consultation_deadline"])
        if deadline:
            entry["deadline"] = deadline
        ref = r["reference_number"]
        if ref and len(ref) <= 40 and not ref.startswith("/"):
            entry["refnum"] = ref
        # Big-4-Fachbeiträge, die genau diese Meldung kommentieren (LLM-geprüft).
        adv = adv_by_doc.get(r["document_id"]) or []
        if adv:
            entry["adv"] = adv
            advisory += len(adv)
        bucket.append(entry)
        matched += 1

    from .db import utcnow
    payload = {"generated_at": utcnow(), "updates": updates, "praxis": praxis}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return {"path": path, "frameworks": len(updates), "updates": matched,
            "praxis": len(praxis), **qa_stats,
            "advisory": advisory, "summarized": summarized,
            "impact_rated": len(impacts),
            "scanned": len(rows), "sources": sources_info["sources"],
            "llm": "aktiv" if api_key() else "inaktiv (kein OPENROUTER_API_KEY)"}
