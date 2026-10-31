# Scraper-Quellenliste (Stand 03.09.2026, 30 Quellen: Welle 1–6 umgesetzt)

> Status: umgesetzt in `scraper/regradar/`. Die konkreten, live verifizierten Endpunkte stehen in `README.md`. DIP benötigt den frei publizierten API-Key als `DIP_API_KEY`.

Basis: `regulatory_source_target_group_matrix.md` und `Claude Code Prompt_ Regulatory Monitoring Backend.md`.
Zugriffspriorität: `API > XML > JSON > RSS > Sitemap > HTML > PDF`. Verbandsquellen (LICENSED) werden nicht gecrawlt.

## Welle 1 — Core Legal (P0)

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 1 | EUR-Lex / CELLAR | EU | SPARQL/REST-API + RSS | REGULATION, DIRECTIVE, DELEGATED/IMPLEMENTING_REGULATION | Stabile IDs: CELEX/ELI. Discovery über tägliche OJ-Veröffentlichungen |
| 2 | Gesetze im Internet | DE (Bund) | XML (`gii-toc.xml` + Norm-XML) | LAW | Vollständig strukturiertes XML, ideal für Abschnitts-Parsing (§-Ebene) |
| 3 | DIP Bundestag/Bundesrat | DE (Parlament) | REST-API (JSON, offizieller API-Key) | LEGISLATIVE_PROPOSAL, PARLIAMENTARY_DOCUMENT | Frühwarnsignal für kommende Gesetze; DIP-ID + Drucksachennummer |
| 4 | recht.bund.de (Bundesgesetzblatt) | DE (Bund) | RSS + HTML/PDF | LAW (verkündet) | Amtliche Verkündung; BGBl-Fundstelle als ID |
| 5 | Rechtsprechung im Internet | DE (Gerichte) | RSS + XML | COURT_DECISION | ECLI als stabile ID; BGH/BFH-Entscheidungen enthalten |

## Welle 2 — Aufsichtsbehörden (P0)

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 6 | AMLA | EU | HTML (Publications/Consultations) | RTS, ITS, GUIDELINE, CONSULTATION, FINAL_REPORT | Referenzadapter lt. Backend-Prompt (Kap. 14): End-to-End inkl. Fristen & Adressaten |
| 7 | BaFin | DE | RSS-Feeds + HTML | CIRCULAR, CONSULTATION, ADMINISTRATIVE_PRACTICE, GENERAL_DECISION | Mehrere themenspezifische RSS-Feeds; Geschäftszeichen als ID |
| 7a | BaFin (Expertensuche) | DE | HTML (Servicesuche, Filter Format, 50 je Seite, alle Seiten) | ADMINISTRATIVE_PRACTICE, CIRCULAR, SUPERVISORY_STATEMENT, CONSULTATION, GENERAL_DECISION | Seit 31.10.2026: Auslegungsentscheidungen, Merkblätter, Rundschreiben, Aufsichtsmitteilungen, Konsultationen, (Allgemein-)Verfügungen inkl. Altbestand. Nicht: Meldung, Maßnahme, Veranstaltung. Datum = Erstveröffentlichung („geändert am“ zählt nicht). Englische Fassungen, Stellungnahmen Dritter und doppelte Download-Seiten werden übersprungen; überschneidet sich ein Dokument mit dem RSS, bleibt der RSS-Eintrag |
| 8 | EBA | EU | HTML/JSON (Publications) + RSS | GUIDELINE, RTS, ITS, Q_AND_A, CONSULTATION | EBA/GL/…-Referenzen als ID; Single Rulebook Q&A separat |
| 9 | ESMA | EU | Register/Library (JSON-Suche) + RSS | GUIDELINE, RTS, ITS, Q_AND_A, CONSULTATION | ESMA-Dokumentnummern als ID |
| 10 | EZB Bankenaufsicht | EU (SSM) | RSS + HTML | SUPERVISORY_STATEMENT, GENERAL_DECISION, CONSULTATION | bankingsupervision.europa.eu, Presse + Publikationen |
| 11 | Deutsche Bundesbank | DE | RSS + HTML | CIRCULAR, OTHER (Meldewesen, Payments, Fachbeiträge) | Rundschreiben Meldewesen (Feed 633302) + Fachseiten „Themen" (Feed 633288, seit 06.09.2026: Monatsberichts-Einordnungen wie BRUBEG, Aufsichtsbriefings; englische Doppelseiten werden übersprungen). Pressefeed (Tender) und leerer Monatsberichtsfeed nicht genutzt |

## Welle 3 — EU-Ausbau + Frühwarnsignale (umgesetzt am 25.08.2026)

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 12 | EIOPA | EU | sitemap.xml (kein RSS) | GUIDELINE, RTS, ITS, CONSULTATION, OTHER | Datum im URL-Slug (…-2026-07-14_en); schließt Versicherer/PKV/EbAV-Lücke |
| 13 | SRB | EU | RSS (`/en/rss`) | CONSULTATION, OTHER | Resolution/MREL, betrifft fast alle Bankengruppen |
| 14 | EuGH (curia) | EU | HTML (Presseliste Jo2_7052) | COURT_DECISION | cp-Nummer als ID, Rechtssachen (C-…/T-…) als Referenz, PDF archiviert (de/en) |
| 15 | BMF | DE | sitemap.xml, **nur Metadaten** | LEGISLATIVE_PROPOSAL | Detailseiten hinter Radware-Bot-Schutz → wird nicht umgangen; Titel aus Slug |
| 16 | EU-Kommission „Have Your Say" | EU | JSON-API (`brpapi/searchInitiatives`) | CONSULTATION, LEGISLATIVE_PROPOSAL | EU-Frühwarnsignal analog DIP; Feedback-Fristen als Deadline |

## Welle 4 — Q&A/Register, Datenschutz/Cyber, GwG, International (umgesetzt am 25.08.2026)

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 17 | EBA Single Rulebook Q&A | EU | HTML (Drupal-Liste `/single-rule-book-qa/all`) | Q_AND_A | Keine öffentliche JSON-API; publicId (z. B. 2026_7940) als ID, Status Final/Rejected, Rechtsakt+Topic für Framework-Mapping |
| 18 | ESMA Library | EU | HTML (Drupal-Tabelle, sortiert nach `created`) | GUIDELINE, RTS, ITS, Q_AND_A, CONSULTATION, FINAL_REPORT | Schließt die RSS-Lücke bei Q&As/Registerdokumenten; Slug als ID, ESMA-Nummer als Referenz |
| 19 | BSI | DE | RSS (Presse-/Kurzmitteilungen) | OTHER | DORA/NIS2-Kontext (NIS-2-Umsetzungsgesetz etc.) |
| 20 | EDPB | EU | RSS (`feed/news_en`) | GUIDELINE, CONSULTATION, OTHER | DSGVO-Guidelines; Items ohne pubDate → first_seen als Fallback |
| 21 | BfDI | DE | RSS (GSB-Feed) | OTHER | Datenschutz-Aufsicht Bund |
| 22 | FIU Deutschland | DE | RSS (Fachmeldungen, zoll.de) | OTHER | Typologiepapiere/Meldungen für GwG-Pflichtige; kein Seiten-Fetch (robots-Crawl-Delay 180 s) |
| 23 | ESRB | EU | RSS (`rss/press.xml`) | OTHER | Makroprudenzielle Warnungen/Empfehlungen |
| 24 | BIS / Basler Ausschuss (BCBS) | INT | HTML (Publikationsliste `bis.org/committees/bcbs/publications`, Drupal-Karten, 2 Seiten) | STANDARD, CONSULTATION, FINAL_REPORT, OTHER | Seit 09/2026 liefern RSS (`doclist/bcbspubls.rss`) und alte `/publ/`-Listen 404; Adapter `bis` liest die Karten (Serien-Badge → Typ, Slug als ID). Working Papers werden übersprungen. 12–24 Monate Vorlauf vor EU-Umsetzung; Rahmenwerk `bcbs` |
| 25 | FSB | INT | RSS (WordPress-Feed) | FINAL_REPORT, CONSULTATION, OTHER | Financial Stability Board |
| 26 | IOSCO | INT | HTML (Public-Reports-Liste, ersatzweise Media Releases), **nur Metadaten** | FINAL_REPORT, CONSULTATION | PDFs und seit 30.09.2026 auch die Reports-Liste hinter Cloudflare-Bot-Schutz → wird nicht umgangen; dann Media-Releases-Liste (IOSCONEWS-Nummer als ID), sonst IOSCOPD-Nummer |

## Welle 5 — AI Act (umgesetzt am 30.08.2026)

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 27 | EU-Kommission / AI Office (digital-strategy.ec.europa.eu) | EU (GD CNECT) | HTML (News-Liste `?topic=119` = „Artificial intelligence") | GUIDELINE, CONSULTATION, FINAL_REPORT, OTHER | Offizielle Publikationsplattform für AI-Act-Leitlinien, GPAI Code of Practice, AI Omnibus, Enforcement. Der Site-RSS (`/en/rss.xml`) ist ungefiltert (10 Items, alle Themen) und daher unbrauchbar; Datum + Typ stehen direkt in der Liste |

## Welle 6 — Luxemburg, DG FISMA, EZB (umgesetzt am 03.09.2026)

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 28 | CSSF | LU | RSS, 7 typisierte Feeds (`feed/publications?content_type=…`: circular-cssf, cssf-regulation, communique, public-consultation, cssf-faq, law, grand-ducal-regulation) | CIRCULAR, REGULATION, CONSULTATION, Q_AND_A, LAW, OTHER | Luxemburger Fonds-/ManCo-Recht; Referenzen „Circular CSSF 26/910", „CSSF Regulation No 12-02" aus Titel; Zuordnung zuerst gegen Lux-Rahmenwerke (`SOURCE_RULES`) |
| 29 | EU-Kommission / GD FISMA | EU | HTML (`finance.ec.europa.eu/finance-news_en`, ECL-Liste, 2 Seiten) | LEGISLATIVE_PROPOSAL, CONSULTATION, FINAL_REPORT, OTHER | Frühwarnsignal für RIS, Verbriefung, PSD3, Digitaler Euro, SIU-Paket; Rat (403) und Parlament (202-Bot-Check) liefern keine Feeds |
| 30 | EZB (Pressemitteilungen) | EU | RSS (`rss/press.xml`) | OTHER | Digitaler Euro, IReF, TARGET; Reden fängt der NOISE-Filter |

## Welle 7 — BIS-Gremien (umgesetzt am 22.10.2026)

Anlass: Kundenhinweis, die BIS-Neuigkeiten (BCBS 239 u. a.) fehlten. Ursache: Der BCBS-Feed war seit 09/2026 tot und die Quelle deaktiviert. Alle vier Quellen speisen das Rahmenwerk `bcbs` (data.ts, `jur: "INT"`); Zuordnung über `SOURCE_RULES` (webexport), Filter über den `[BIS]`-Präfix im Relevanzprompt (llmfilter, FORMAT 5).

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 31 | CPMI (BIS) | INT | HTML (`bis.org/committees/cpmi/publications`), Adapter `bis` | FINAL_REPORT, CONSULTATION, OTHER | Zahlungsverkehr/Marktinfrastrukturen; der Relevanzfilter lässt nur Standards und Leitlinien mit Bankbezug durch |
| 32 | FSI (BIS) | INT | HTML (`bis.org/about/fsi/publications`), Adapter `bis` | FINAL_REPORT, OTHER | Aufsichtsstudien; nur mit Standard-/Leitliniencharakter relevant |
| 33 | BIS-Pressemitteilungen | INT | RSS 1.0 (`bis.org/doclist/all_pressrels.rss`), Adapter `rss`; Link-Filter `RSS_LINK_EXCLUDE["bis_press"]` | OTHER | Sitzungsergebnisse, Umsetzungsstände, Ankündigungen (z. B. Überprüfung des Krypto-Standards), die in den Publikationslisten fehlen; Doppelmeldungen zur selben Veröffentlichung führt `samepub.py` zusammen |

Auslandsbewertungen (RCAP für Kanada, Japan …) und Monitoring-Berichte entfallen per `BIS_RULES`. Robots.txt von bis.org erlaubt `/committees/` und `/publications/`.

**Nicht angebunden: Rat der EU / Europäisches Parlament** — consilium.europa.eu antwortet 403 („Browser check"), europarl.europa.eu mit 202-Challenge; beides Bot-Schutz, wird nicht umgangen. Ersatz: DG-FISMA-News + EZB.

**Nicht angebunden: FATF** — fatf-gafi.org liefert 403 auf allen Pfaden (Cloudflare-Bot-Schutz, auch mit Browser-User-Agent); wird nicht umgangen. Wieder prüfen, falls ein offizieller Feed erscheint.

## Später — danach (P1)

| # | Quelle | Bemerkung |
|---|---|---|
| 27 | BGH / BFH direkt | Nur falls Rechtsprechung im Internet nicht ausreicht (Lücken/Verzögerung) |
| 28 | FATF | Sobald zugänglich (s. o.) |

## Umsetzungsplan je Adapter (nach Freigabe)

- Eigener Ordner `scraper/` mit Python-Backend: gemeinsames `SourceAdapter`-Interface (`discover → fetch → parse → normalize`), Source Registry, Raw-Archiv (SHA-256, ETag/Last-Modified), Canonical Document Model, SQLite/PostgreSQL-Persistenz.
- Reihenfolge: **2 (Gesetze im Internet, XML) → 3 (DIP, API) → 6 (AMLA, HTML)** — das erfüllt die MVP-Definition (3 Quellentypen), danach 1, 4, 5, 7–11.
- Defensive Scraping-Regeln: Rate Limiting, Conditional GET, Timeouts, Retry mit Backoff, eigener User-Agent. Keine Paywalls/Logins.
