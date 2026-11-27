# Scraper-Quellenliste (Welle 1–10 umgesetzt, zuletzt Schweiz am 28.11.2026)

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

## Welle 9 — Luxemburg vertieft (umgesetzt am 21.11.2026)

Anlass: Fondsmanager und Fonds mit Luxemburg-Bezug. Neue Rahmenwerke `cssfreport`, `cssfmanco`, `cssfdistr` (Kind von `cbdf`), `cssfesg`, `cssfucits`, `cssfspecial` sowie die EU-Rahmenwerke `ucits` und `cbdf`. Zuordnung über `SOURCE_RULES` in webexport.py: nummerngenaue Regeln zuerst, schwache Stichworte (Verwahrstelle, SIF, Geldmarktfonds) erst nach AML. Luxemburger Treffer, deren URL schon als kuratierter Eintrag in data.ts steht, werden nicht doppelt gezeigt (`_curated_urls`).

| # | Quelle | Behörde / Jurisdiktion | Zugriffsweg | Dokumenttypen | Bemerkung |
|---|---|---|---|---|---|
| 28a | CSSF (Feed, zusätzliche Typen) | LU | RSS: `technical-document`, `cssf-guidance`, `other-guidance`, `studies-reports`, `statement`, `national-regulation` | GUIDELINE, OTHER, REGULATION | Typnamen nur aus `cssf.lu/en/rss-feed/`: Unbekannte Namen liefern stillschweigend den Allgemeinfeed. Je Feed höchstens 20 Einträge. |
| 32 | CSSF Archiv (`cssf_archive`) | LU | HTML-Listenseite `cssf.lu/en/regulatory-framework/?content_type=…&entity_type=…&archives=include`, Adapter `cssfarchive` | CIRCULAR, REGULATION, LAW, Q_AND_A | Wöchentlich; Erstlauf mit `run cssf_archive --since=1990-01-01 --no-fetch` holt rund 650 Texte seit 1991, auch aufgehobene. cssf.lu sperrt die IP nach rund 70 Abrufen in wenigen Minuten: Pause 4 s je Seite. |
| 33 | Legilux (Mémorial A) | LU | SPARQL-GET `data.legilux.public.lu/sparqlendpoint` (jolux:Act), Adapter `legilux` | LAW, REGULATION | Kein RSS. Titelfilter auf Fonds-, Finanzsektor-, AML-, DORA-Begriffe; Erstlauf `--since=2004-01-01` (169 Akte). Französische Titel, nur Metadaten. |
| 34 | Chambre des Députés (Dossiers) | LU | HTML `chd.lu/fr/dossier/<Nr>`, Adapter `chd`, Zustand in `data/chd_state.json` | BILL | Beobachtet einschlägige Dossiers (Status, Avis, Änderungsanträge) und scannt neue Nummern oberhalb der höchsten bekannten. |
| 35 | CRF Luxemburg (FIU) | LU | RSS `crf.public.lu/en/actualites.rss` (protokollrelative Links) | OTHER | Alles → `cssfaml`; rund 1 Meldung im Monat. |

Anzeigetexte für Altbestand ohne OpenRouter: `python3 -m regradar archive-titles` übersetzt Titel und Untertitel über `claude -p` (Abo) in den Cache `llm_summary` (model `claude-archive`). Es erfindet keinen Inhalt.

## Welle 10 — Schweiz (umgesetzt am 28.11.2026)

Anlass: 20 Schweizer Rahmenwerke (`ch*`, jur `CH`) in data.ts ohne automatische Quellen. Alle Adapter stehen in `adapters/ch.py`, die Zuordnung in `webexport.py` (`CH_RULES`, `SOURCE_RULES` für `six_regulation`, `oak_bv`, `amas`, `fedlex`). Alle Schweizer Quellen sind exklusiv (kein Rückfall auf EU-Rahmenwerke), ihre Treffer entfallen, wenn die URL schon kuratiert in data.ts steht (`_curated_urls`). Ausschlüsse (`CH_DROP`): Personalien, Reden, Enforcement und Krisenpläne einzelner Institute, Dekotierungen, Verbandsmeldungen, Sanktionslisten-Pflege, Steuern (u. a. automatischer Informationsaustausch), Kranken-/Unfallversicherung, Cyber-Einzelvorfälle. Für den LLM-Relevanzfilter tragen Schweizer Meldungen das Präfix `[CH]` (Prompt-Ausnahme „Schweiz“, kein EU-/DE-Bezug nötig; `FORMAT` bleibt, siehe Kommentar in `llmfilter.py`). In `scope.py` entfernt ein Guard für jur `CH` Ortsmerkmale für DE, LU und EU aus den Adressatengruppen; „Deutsches Recht braucht Deutschland-Bezug“ gilt weiter nur für jur `DE`.

Rate und Verhalten: Listenabrufe mit mindestens 2,5 s Pause (`PAUSE`), je Host mindestens 1,5 s (`http.py`), offizieller User-Agent des Projekts, keine Browser-Identität. Bei 403/429/5xx wird der Lauf mit Fehler beendet (kein Umgehen); `http.get` wiederholt nur bei 429/5xx mit Backoff.

| # | Quelle | Jur. | Zugriffsweg | Dokumenttypen | Zweck, Rate, Zuordnung |
|---|---|---|---|---|---|
| 36 | FINMA News (`finma`) | CH | RSS `finma.ch/de/rss/news/` (offiziell, 50 Einträge, mit Kategorie und Datum), Adapter `rss` | OTHER, CONSULTATION, CIRCULAR | Medienmitteilungen, Anhörungseröffnungen, Sanktionsnews. Ausgeschlossen per `RSS_LINK_EXCLUDE`: Sanktionslisten-Meldungen (`-sr-<Nr>`, „aktualisierte-sanktionsmeldung“) und Reden. Alle 6 h, ein Feed-Abruf plus Detailseite je neuem Eintrag. Zuordnung `CH_RULES` (Rundschreibennummern und Normen vor Themenwörtern). |
| 37 | FINMA Dokumente (`finma_docs`) | CH | JSON: POST `finma.ch/de/api/search/getresult` mit `ds` und `Order` (derselbe Aufruf wie im Browser, Werte aus `data-source`/`data-order` der Seiten Rundschreiben und FINMA-Aufsichtsmitteilungen); laufende Anhörungen aus dem HTML `…/anhoerungen/laufende-anhoerungen/` | CIRCULAR, SUPERVISORY_STATEMENT, CONSULTATION | Rundschreiben (37, Datum = letzte Änderung), Aufsichtsmitteilungen (Titel = „Aufsichtsmitteilung NN/JJJJ: Thema“), Entwürfe in Anhörung. Nur Metadaten, PDFs bleiben extern; URL ohne Hash-Parameter (wie kuratierte Einträge). Alle 12 h, 3 Abrufe mit 2,5 s Pause. Zuordnung `CH_RULES`. |
| 38 | News Service Bund (`ch_admin`) | CH | RSS `newsd.admin.ch/newsd/feeds/rss?lang=de&org-nr=1&kind=M&start_date=<Datum>` (offizieller Abo-Feed aller Bundesämter), Adapter `nsb` | OTHER | Ersatz für sif/seco/bacs/bsv/bj/edoeb.admin.ch, die keinen eigenen Feed haben (Nuxt-Seiten ohne RSS). Filter nach Titel und Teaser (starke Begriffe wie Finanzmarkt, FIDLEG, Geldwäscherei, Krypto, berufliche Vorsorge in Titel/Teaser; schwache wie Bank, Cyber, Datenschutz nur im Titel). SECO: nur Sanktionspakete/Pflichtänderungen über die Bundesrat-Meldung („setzt das n. Sanktionspaket um“), keine Listen-Updates. Standard-Fenster 30 Tage, ein Abruf je Lauf, alle 6 h. Zuordnung `CH_RULES`. |
| 39 | SIX Exchange Regulation (`six_regulation`) | CH | JSON `…/regulatory-communication/_jcr_content/root/contentparsys/parsys/assets_taxonomy_filt.results.json` und `…/media-releases/…/page_taxonomy_filter.results.json` (so lädt die Seite ihre Listen), Adapter `six` | SUPERVISORY_STATEMENT, OTHER | Regulatorische Mitteilungen (208, ab 2010) und Medienmitteilungen zu Regelwerken. Einzelfälle (Dekotierung, Sanktionsbescheid, Untersuchung) entfallen. 2 Abrufe alle 12 h. Alles → `chsix`. |
| 40 | OAK BV (`oak_bv`) | CH | HTML `oak-bv.admin.ch/de/weisungen` und `/de/mitteilungen` (Karten mit Referenz, Version, Datum), Adapter `oak` | GUIDELINE, SUPERVISORY_STATEMENT | Weisungen und Mitteilungen der Oberaufsichtskommission. 2 Abrufe täglich. Alles → `chbvg`. |
| 41 | AMAS (`amas`) | CH | HTML `am-switzerland.ch/de/medien-positionen/medien/medienmitteilungen`, Adapter `amas` | OTHER | Nur Medienmitteilungen (Zirkulare und Musterdokumente liegen hinter dem Mitgliederlogin und werden nicht abgerufen). Einzelne Mitteilungen ohne eigene URL: Anker `#<Titel-Slug>`. Täglich. Zuordnung: Sustainable Finance → `chnachhalt`, Fondsrecht/Selbstregulierung → `chkag`, FIDLEG/FINIG → `chfidleg`, Rest entfällt. |
| 42 | Fedlex (`fedlex`) | CH | SPARQL-GET `fedlex.data.admin.ch/sparqlendpoint` (JOLUX wie Legilux), ein Aufruf: `jolux:Consolidation` je Erlass mit `dateApplicability` und `dct:created`, Adapter `fedlex` | LAW | Neue konsolidierte Fassungen von FIDLEG/FIDLEV (950.1/950.11), FINIG/FINIV (954.1/954.11), KAG/KKV (951.31/951.311), GwG/GwV/GwV-FINMA (955.0/955.01/955.033.0), BankG/BankV/ERV/LiqV (952.0/952.02/952.03/952.06), VAG/AVO (961.01/961.011), BVG/BVV 2 (831.40/831.441.1), FinfraG/FinfraV (958.1/958.11), FINMAG (956.1), DSG/DSV (235.1/235.11), EmbG (946.231), ISG, CSV, TJPG/TJPV. SR-Nummern und Erlass-URIs am 28.11.2026 über `jolux:historicalLegalId` bzw. Titel geprüft. Datum = früheste Veröffentlichung der Änderung (Fallback `dct:created`), Titel „<Kurzname> (SR n): neue Fassung gilt ab <Datum>“. Fassungen mit Inkrafttreten später als 2 Jahre (Platzhalter) entfallen. Ukraine- und Belarus-Verordnung bewusst nicht enthalten (jede Listenänderung erzeugt eine Fassung). Erstlauf mit `run fedlex --since=2018-01-01 --no-fetch` für die Fassungshistorie; Standard-Fenster 60 Tage. Zuordnung über den Kurznamen am Titelanfang. |

Nicht angebunden / bewusst offen:

- EDÖB, BACS, BSV, SECO, SIF: eigene Seiten (Nuxt) ohne RSS; Meldungen kommen über den News Service Bund (Nr. 38). Interne Dauerseiten (SECO-Sanktionsübersicht, BACS-Meldepflicht) werden nicht beobachtet.
- AMAS-Zirkulare und AMAS-Richtlinien: Mitgliederbereich bzw. keine Änderungsliste.
- FINMA „Anhörungen und Evaluationen“ (abgeschlossene Anhörungen) sowie FINMA-Stellungnahmen: nur laufende Anhörungen und die News-Meldungen. Seite `finma-aufsichtsmitteilungen` nutzt die JSON-Suche (Nr. 37).
- admin.ch/gov-Medienmitteilungen direkt: nicht nötig, der Bundesfeed liefert dieselben Meldungen.
- Fehlt im Katalog (`web/lib/relevance/catalog.json`) ein Merkmal `sitz_ch`, bleiben Schweizer Adressatengruppen ohne Ortsmerkmal; der Guard in `scope.py` ergänzt es automatisch, sobald es existiert.
