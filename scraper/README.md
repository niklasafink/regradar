# Regulatory Radar – Scraper

Python-Backend (nur Standardbibliothek, Python ≥ 3.9), das 26 regulatorische
Primärquellen überwacht und daraus Dokumente, Versionen und Regulatory Events
in SQLite erzeugt.

## Schnellstart

```bash
cd scraper
python3 -m regradar init          # DB anlegen, Source Registry seeden
python3 -m regradar run all       # alle Quellen crawlen
python3 -m regradar run bafin     # einzelne Quelle
python3 -m regradar run all --no-fetch   # nur Discovery, keine Inhalte
python3 -m regradar sources       # Quellen-Status
python3 -m regradar report 30     # neueste Regulatory Events
python3 -m regradar export data/export.json
python3 -m regradar big4         # Big-4-Fachbeiträge einsammeln (PwC, KPMG, Deloitte …)
python3 -m regradar export-web   # schreibt web/lib/live.json für das Frontend
python3 -m regradar gap-report   # Big4-Artikel ohne Primärquelle per Mail melden
```

## Frontend-Anbindung

`export-web` ordnet die gescrapten Dokumente per Schlüsselwort-Mapping den
Rahmenwerken der Web-App zu (`regradar/webexport.py`, `FRAMEWORK_RULES`) und
schreibt `web/lib/live.json` — nur High-Level-Felder: Datum, Typ, Titel
(Originalsprache), Behörde, ggf. Frist und der Link zur Primärquelle.
Rauschen (Anbieterwarnungen, Bußgelder, Veranstaltungen, Newsletter) wird
über die `NOISE`-Regel ausgefiltert; zusätzlich prüft ein LLM-Filter
(`regradar/llmfilter.py`, OpenRouter) jede Kandidaten-Meldung auf
regulatorische Relevanz. Dafür `OPENROUTER_API_KEY` in `scraper/.env`
eintragen (wird von der CLI automatisch geladen) oder exportieren (optional
`OPENROUTER_MODEL`, Default `google/gemini-2.5-flash-lite`); Ergebnisse
werden in der Tabelle `llm_relevance` gecacht, ohne Key läuft der Export
unverändert nur mit der Regex-Regel. Zusätzlich beurteilt ein LLM je
exportiertem Update den Impact für die Zielgruppe (`regradar/impact.py`,
Regelwerk in `scraper/IMPACT.md`, Cache `llm_impact`, optional
`OPENROUTER_IMPACT_MODEL`); das Urteil landet als Feld `imp`
(high/medium/low) in `live.json`, ohne Urteil greift im Frontend die
Dokumenttyp-Heuristik. Die App mischt die Live-Updates in die
bestehenden Zeitleisten (`web/lib/live.ts`); Aktualisierung = `run all` +
`big4` + `export-web`, danach lädt Next.js die neue JSON automatisch.

**Big-4-Kommentare** (`regradar/big4.py`, Befehl `big4`): sammelt Fachbeiträge
von PwC (fünf WordPress-Blogs per RSS), PwC Legal (HTML-Listing), KPMG
Klardenker Financial-Services-Hub (HTML-Listing), Deloitte Legal (Sitemap
`sitemap_dl_de.xml` + og:title/description der Artikelseiten, Fetch-Budget
15/Lauf) und dem Blog „Wald vor lauter Normen" (RSS) in die Tabelle
`big4_articles`. Ein Regex-Vorfilter (dieselben `FRAMEWORK_RULES`) ordnet
jeden Artikel einem Rahmenwerk zu; beim `export-web` entscheidet dann das
LLM pro Behörden-Update, welche Artikel genau diese Meldung kommentieren
(Cache in `big4_matches`, ohne `OPENROUTER_API_KEY` keine Zuordnung). Die
Treffer landen als `adv`-Feld am Update in `live.json` und erscheinen im
Frontend auf Update- und Rahmenwerk-Detailseiten („So kommentieren die
Big 4"). EY pflegt kein scrapebares deutsches Regulatory-Angebot und fehlt
deshalb bewusst.

**Gap-Report** (`regradar/gapreport.py`, Befehl `gap-report`): meldet dem
Betreiber per Mail (Resend, max. 1×/Tag) Big4-/Kanzlei-Artikel der letzten
14 Tage, die trotz strenger LLM-Prüfung keinem gescrapten Behörden-Dokument
zuzuordnen sind — Kandidaten für neue Scraper-Quellen. Vier Stufen:
big4_matches, Relevanzfilter (Cache `big4_gap_relevance`), Abgleich gegen
Dokumente der letzten 180 Tage (im Zweifel „abgedeckt"), ohne
`OPENROUTER_API_KEY` keine Meldung. Jeder Artikel wird nur einmal gemeldet
(`big4_gap_reported`); `--force` übergeht die Tages-Sperre (`big4_gap_runs`).
Läuft am Ende von `run_hourly.sh`.

Für **DIP** (Bundestag) den frei publizierten API-Key von
[dip.bundestag.de](https://dip.bundestag.de) (Hilfe → DIP-API) setzen:

```bash
export DIP_API_KEY="..."
```

## Quellen (alle Endpunkte am 25.08.2026 live verifiziert)

| Quelle | Adapter | Zugriff |
|---|---|---|
| EUR-Lex / CELLAR | `eurlex` | SPARQL-API (`publications.europa.eu/webapi/rdf/sparql`), CELEX-IDs |
| Gesetze im Internet | `gii` | `gii-toc.xml` + Norm-XML (zip), Watchlist: KWG, GwG, WpHG, KAGB, ZAG, VAG, PfandBG, FinDAG, HinSchG, WpIG, SAG; §-genaue Sections |
| DIP Bundestag | `dip` | REST-API, Vorgänge „Gesetzgebung" mit Finanz-Keywords |
| Bundesgesetzblatt | `rss` | `recht.bund.de/rss/feeds/rss_bgbl-1.xml` + `rss_bgbl-2.xml` |
| Rechtsprechung im Internet | `rii` | `rii-toc.xml`, gefiltert BGH/BFH, ECLI aus Entscheidungs-XML |
| AMLA | `amla` | `sitemap.xml` → Konsultationen, RTS/ITS, News; Fristen + PDFs aus Detailseiten |
| BaFin | `rss` | 4 Feeds: Rundschreiben, Aufsicht, Maßnahmen, alle Meldungen |
| EBA | `rss` | `rss.xml`; Digest-Items („E-mail alert") werden in Einzelpublikationen aufgelöst |
| ESMA | `rss` | `rss.xml` |
| EZB SSM | `rss` | `bankingsupervision.europa.eu/rss/press.xml` |
| Bundesbank | `rss` | Feeds 633302 (Rundschreiben) + 633286 (Presse) |
| EIOPA | `eiopa` | `sitemap.xml`, Datum aus URL-Slug (…-2026-07-14_en), Fenster 120 Tage, Detailseiten inkl. Fristen |
| SRB | `rss` | `srb.europa.eu/en/rss` |
| EuGH (curia) | `curia` | Presseliste `jcms/Jo2_7052`, cp-Nummer als ID, `<base>`-aufgelöste PDF-Links (de bevorzugt) |
| BMF | `bmf` | `sitemap.xml` gefiltert auf `/Gesetzestexte/Gesetze_Gesetzesvorhaben/`; **nur Metadaten** (Detailseiten hinter Radware-Bot-Schutz, wird nicht umgangen) |
| EU-Kommission „Have Your Say" | `hys` | JSON-API `brpapi/searchInitiatives` (7 Finanz-Suchbegriffe); Feedback-Fristen als Deadline, kein Seiten-Fetch (JS-App) |
| EBA Single Rulebook Q&A | `ebaqna` | Drupal-Liste `/single-rule-book-qa/all` (keine öffentliche JSON-API); publicId als ID, Status Final/Rejected, Rechtsakt + Topic in Summary |
| ESMA Library | `esmalib` | Drupal-Tabelle `/databases-library/esma-library` sortiert nach `created` (keine öffentliche JSON-API); Slug als ID, ESMA-Dokumentnummer als Referenz |
| BSI | `rss` | Feed Presse-/Kurzmitteilungen (`RSSNewsfeed_Presse_Veranstaltungen.xml`) — DORA/NIS2-Kontext |
| EDPB | `rss` | `edpb.europa.eu/feed/news_en` (Items ohne pubDate → first_seen als Fallback) |
| BfDI | `rss` | GSB-Feed `SiteGlobals/Functions/RSSFeed/Allgemein/rssnewsfeed.xml` |
| FIU Deutschland | `rss` | Fachmeldungen-Feed auf zoll.de; **kein Seiten-Fetch** (robots.txt Crawl-Delay 180 s) |
| ESRB | `rss` | `esrb.europa.eu/rss/press.xml` |
| BIS / Basler Ausschuss | `rss` | `bis.org/doclist/bcbspubls.rss` — RSS 1.0/RDF, Datum aus `dc:date` |
| FSB | `rss` | `fsb.org/feed/` (WordPress) |
| IOSCO | `iosco` | Liste `publications/?subsection=public_reports`, IOSCOPD-Nummer als ID; **nur Metadaten** (PDFs hinter Cloudflare-Bot-Schutz, wird nicht umgangen) |

**FATF** ist nicht angebunden: fatf-gafi.org liefert 403 auf allen Pfaden
(Cloudflare-Bot-Schutz, auch mit Browser-User-Agent) — wird nicht umgangen.

## Architektur

```
regradar/
  models.py      DiscoveredDocument, RawDocument, CanonicalDocument, Section
  db.py          SQLite-Schema (sources, crawl_runs, raw_documents,
                 documents, document_versions, document_sections,
                 regulatory_events) – PostgreSQL-migrierbar
  http.py        defensiver Client: 1,5 s/Host, Conditional GET (ETag/
                 Last-Modified), Timeout 30 s, Retry mit Backoff, fester UA
  registry.py    Source Registry Seed + RSS-Feed-Liste + GII-Watchlist
  pipeline.py    discover → fetch → raw archivieren (SHA-256) → normalize
                 → Change Detection (normalized_sha256) → Events
  adapters/      base (Interface), rss (generisch, 14 Quellen; RSS 2.0
                 + RSS 1.0/RDF), eurlex, gii, dip, rii, amla, eiopa,
                 bmf, curia, hys, ebaqna, esmalib, iosco
  cli.py         init | sources | run | report | export
```

Prinzipien aus dem Backend-Prompt:

- **Originale unverändert archivieren:** jeder Abruf landet mit SHA-256 unter
  `data/raw/<quelle>/`, Metadaten in `raw_documents`.
- **Zwei Change-Ebenen:** technisch (ETag/Last-Modified/raw-SHA), fachlich
  (`normalized_sha256` über Titel, Status, Daten, Volltext). Nur fachliche
  Änderungen erzeugen neue `document_versions` + `DOCUMENT_UPDATED`-Events.
- **Idempotenz:** UNIQUE(source_id, external_id); Wiederholungsläufe erzeugen
  keine Dubletten.
- **Stabile fachliche IDs:** CELEX, ECLI, GII-Slug, DIP-Vorgangs-ID,
  BaFin-/EBA-Referenzen aus Titeln; URLs nur als Fallback.
- **Höflichkeit:** max. 25 Inhalts-Fetches pro Quelle und Lauf, Rate-Limit
  pro Host, keine Umgehung von Logins/Paywalls; Verbandsquellen (LICENSED)
  sind nicht angebunden.

## Neue Quelle hinzufügen

1. Eintrag in `registry.SOURCES` (bei RSS zusätzlich `RSS_FEEDS`).
2. Falls kein RSS: Adapter-Klasse in `regradar/adapters/` mit
   `discover()` / `fetch_url()` / `normalize()` und Registrierung in
   `adapters/__init__.py`.
3. `python3 -m regradar run <source_id> --no-fetch` zum Testen.

## Nächste Ausbaustufen

- Structural Diff auf §-/Artikel-Ebene (Sections liegen bereits vor)
- LLM-Schicht für Change-Summary + Relevanzklassifikation mit Evidence
- Zielgruppen-Mapping (`SOURCE/NORM → TARGET_GROUP`) aus
  `regulatory_source_target_group_matrix.md`
- Neue Rahmenwerke im Frontend (Datenschutz/DSGVO, CSRD/ESG, eIDAS 2,
  KI-Verordnung, Verbraucherschutz), damit die Welle-4-Quellen (EDPB,
  BfDI, BSI …) im Web-Export mehr Treffer erzeugen
- FATF, falls der Cloudflare-Bot-Schutz fällt oder ein offizieller
  Feed erscheint
- PostgreSQL-Migration, Scheduler + E-Mail-Digest (Resend-Anbindung
  im Web-Teil liegt bereits vor)
