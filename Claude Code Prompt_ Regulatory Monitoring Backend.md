# Claude Code Prompt: Regulatory Monitoring Backend

Du bist **Lead Backend Engineer, Data Engineer und RegTech Architect**. Deine Aufgabe ist es, in diesem Repository ein produktionsnahes Backend für ein **regulatorisches Rechtsmonitoring für Banken und Asset Manager** aufzubauen.

## 0. Arbeitsweise vor Implementierung

Bevor du Code schreibst:

1. Analysiere das bestehende Repository vollständig: Architektur, Sprache, Dependencies, Datenbank, Tests, Konfiguration, bestehende Patterns.
2. **Suche aktiv nach verfügbaren/installierten Claude-Code-Skills, Agents, MCPs, Commands und sonstigen Tools**, die für diese Aufgabe hilfreich sind.
3. Nutze relevante bereits installierte Skills aktiv, insbesondere für:
   - Backend Architecture
   - Web Scraping / Crawling
   - APIs
   - Datenmodellierung
   - PostgreSQL
   - Testing
   - Security
   - Python
   - PDFs/XML/HTML
   - Knowledge Graphs / Graph Modelling
4. Falls Skill-Suche unterstützt wird, suche zuerst nach passenden Skills, bevor du eigene Lösungen implementierst.
5. Bestehende Projektkonventionen haben Vorrang vor neuen Frameworks.
6. Erstelle danach einen kurzen Implementierungsplan und arbeite ihn selbstständig ab.
7. Stelle keine unnötigen Rückfragen. Triff vernünftige technische Annahmen und dokumentiere sie.
8. Arbeite iterativ und führe Tests nach jedem größeren Modul aus.
9. Ändere nichts außerhalb des für dieses Projekt notwendigen Scopes.

**Wichtig:** Mit „Graph Thinking“ ist kein Ausgeben interner Chain-of-Thought gemeint. Verwende graphbasiertes Denken auf **Daten- und Architektur-Ebene**: regulatorische Dokumente, Normen, Behörden, Änderungen, Rechtsgrundlagen, Adressaten und Vorgänger/Nachfolger sollen als Beziehungen modellierbar sein.

---

# 1. Ziel

Das System soll regulatorische Quellen regelmäßig überwachen und daraus strukturierte **Regulatory Events** erzeugen.

Es reicht ausdrücklich NICHT, lediglich festzustellen:

> „Auf Webseite X hat sich etwas geändert.“

Das System muss möglichst automatisch beantworten:

- **Was wurde veröffentlicht?**
- **Was hat sich gegenüber vorher geändert?**
- **Welche konkreten regulatorischen Anforderungen ändern sich?**
- **Welche Paragraphen / Artikel / Abschnitte sind betroffen?**
- **Für wen ist die Änderung relevant?**
- **Warum ist sie für diese Zielgruppe relevant?**
- **Ab wann gilt sie?**
- **Welche Fristen bestehen?**
- **Welchen regulatorischen Status hat sie?**
- **Welche anderen Normen/Dokumente hängen damit zusammen?**
- **Welche Primärquelle belegt jede Aussage?**

Die Zusammenfassung soll primär in **prägnanten Stichpunkten** vorliegen.

---

# 2. Zielgruppen

Das Relevanzmodell muss mindestens folgende Zielgruppen unterscheiden können:

```text
BANK
CREDIT_INSTITUTION
SIGNIFICANT_INSTITUTION
LESS_SIGNIFICANT_INSTITUTION
INVESTMENT_FIRM

ASSET_MANAGER
AIFM
UCITS_MANAGEMENT_COMPANY
KVG
AIF
UCITS
DEPOSITARY

PAYMENT_INSTITUTION
EMONEY_INSTITUTION

AML_OBLIGED_ENTITY

OTHER_FINANCIAL_INSTITUTION
```

Das Modell muss später erweiterbar sein.

Relevanz darf nicht nur über Keywords bestimmt werden.

Berücksichtige insbesondere:

- explizite Adressaten des Dokuments
- Rechtsgrundlage
- referenzierte Gesetze/Verordnungen
- regulierte Tätigkeit
- Institutstyp
- ggf. Größenklasse
- Produkte
- Jurisdiktion
- regulatorische Rollen
- Abhängigkeiten zu bereits relevanten Normen

---

# 3. Quellen – Priorität

Baue eine Architektur mit unabhängigen Source Adapters.

Implementiere zunächst, soweit technisch sinnvoll und ohne unnötige Komplexität:

### Core Legal Sources

1. EUR-Lex / CELLAR
2. Gesetze im Internet
3. DIP – Dokumentations- und Informationssystem Bundestag/Bundesrat
4. Bundesgesetzblatt / recht.bund.de
5. Rechtsprechung im Internet

### Banking / Financial Regulation

6. BaFin
7. EBA
8. ESMA
9. AMLA
10. ECB / Banking Supervision
11. Deutsche Bundesbank
12. optional EIOPA, sofern sich die gemeinsame Adapterarchitektur sinnvoll wiederverwenden lässt

Priorität beim Zugriff:

```text
API
> XML
> JSON
> RSS / Atom
> Sitemap
> serverseitiges HTML
> PDF
> Browser Automation
> OCR
```

Browser-Automation und OCR nur einsetzen, wenn keine stabilere Quelle existiert.

Keine Schutzmechanismen, Logins oder Paywalls umgehen.

---

# 4. Gemeinsames Adapter Interface

Entwirf ein sauberes Interface, beispielsweise:

```python
class SourceAdapter:
    async def discover(self, since=None) -> list[DiscoveredDocument]:
        ...

    async def fetch(self, document: DiscoveredDocument) -> RawDocument:
        ...

    async def parse(self, raw: RawDocument) -> ParsedDocument:
        ...

    async def normalize(self, parsed: ParsedDocument) -> CanonicalDocument:
        ...
```

Optional zusätzlich:

```python
healthcheck()
backfill()
resolve_relations()
```

Adapter dürfen quellenspezifische Logik besitzen, aber Downstream-Code darf nicht wissen müssen, ob ein Dokument ursprünglich aus RSS, XML, API, HTML oder PDF kam.

---

# 5. Source Registry

Erstelle eine persistierte oder sauber konfigurierte Source Registry.

Mindestens:

```text
source_id
name
authority
jurisdiction
base_url
discovery_url
discovery_type
access_class
document_types
poll_interval
adapter
enabled
last_success_at
last_checked_at
```

`access_class`:

```text
PUBLIC
LICENSED
AUTHENTICATED
UNKNOWN
```

Lizenzierte Verbandsquellen sollen später integrierbar sein, zunächst aber nicht automatisch gecrawlt werden.

---

# 6. Discovery

Der Discovery Layer soll **neue oder veränderte regulatorische Dokumente** erkennen.

Pro Kandidat möglichst erfassen:

```text
external_id
title
detail_url
document_url
document_type
authority
publication_date
updated_at
language
status
```

Relevante Dokumenttypen:

```text
LAW
REGULATION
DIRECTIVE
DELEGATED_REGULATION
IMPLEMENTING_REGULATION

RTS
ITS
GUIDELINE
RECOMMENDATION
OPINION
Q_AND_A

CONSULTATION
FINAL_REPORT
SUPERVISORY_STATEMENT

CIRCULAR
ADMINISTRATIVE_PRACTICE
GENERAL_DECISION

LEGISLATIVE_PROPOSAL
PARLIAMENTARY_DOCUMENT

COURT_DECISION

OTHER
```

---

# 7. Originaldaten unverändert archivieren

Jeden Abruf revisionssicher nachvollziehbar speichern.

Mindestens:

```text
retrieved_at
source_url
http_status
content_type
etag
last_modified
raw_sha256
raw_storage_path
```

Original XML/HTML/JSON/PDF niemals durch die normalisierte Fassung ersetzen.

Das System muss später rekonstruieren können:

> Welcher Inhalt wurde zu welchem Zeitpunkt tatsächlich von welcher offiziellen Quelle geladen?

---

# 8. Canonical Document Model

Erstelle ein quellenunabhängiges Modell.

Mindestens:

```text
document_id
canonical_id
external_id

source_id
authority
jurisdiction

title
document_type
status
language

publication_date
consultation_start
consultation_deadline
adoption_date
promulgation_date
effective_from
effective_to

canonical_url
document_urls[]

reference_number

raw_sha256
normalized_sha256

full_text
sections[]

legal_basis[]
citations[]
affected_norms[]

version
previous_version_id
```

Bevorzugte IDs berücksichtigen:

```text
CELEX
ELI
ECLI
DIP-ID
Drucksachennummer
BGBl-Fundstelle
BaFin Geschäftszeichen
EBA/... Referenzen
ESMA... Referenzen
AMLA... Referenzen
```

URL niemals als einzige fachliche ID verwenden.

---

# 9. Strukturierte Dokumentabschnitte

Wenn möglich Dokumente hierarchisch zerlegen:

```text
Document
 ├─ Part
 ├─ Chapter
 ├─ Section
 ├─ Article / §
 │   ├─ Paragraph
 │   ├─ Sentence
 │   └─ Point / Letter
 └─ Annex
```

Für Aufsichtsregelwerke zusätzlich:

```text
AT 4.4.2
BT 1
Kapitel
Randnummer
Tz.
```

Jeder Abschnitt erhält möglichst eine stabile interne ID.

---

# 10. Change Detection

Implementiere zwei Ebenen.

### Technischer Change

Nutze:

```text
ETag
Last-Modified
Content-Length
SHA-256 raw
```

### Fachlicher Change

Normalisiere zunächst irrelevante Websitebestandteile:

- Navigation
- Footer
- Cookie Banner
- dynamische IDs
- Tracking-Parameter
- Darstellungselemente

Danach:

```text
normalized_sha256
```

Nur echte Inhaltsänderungen sollen neue regulatorische Versionen erzeugen.

---

# 11. Structural Diff

Vergleiche nicht ausschließlich kompletten Volltext.

Vergleiche soweit möglich auf:

```text
Article
§
Paragraph
Sentence
Point
Guideline Section
Randnummer
```

Erzeuge strukturierte Änderungen:

```text
ADDED
REMOVED
MODIFIED
MOVED
UNCHANGED
```

Beispiel:

```json
{
  "change_type": "MODIFIED",
  "section": "Article 17(2)",
  "old_text": "...",
  "new_text": "..."
}
```

Bewahre beide Fassungen.

---

# 12. Änderungszusammenfassung

Das ist eine Kernfunktion.

Aus dem Diff soll eine strukturierte Zusammenfassung entstehen:

```json
{
  "change_summary": [
    "Der Anwendungsbereich wurde auf ... erweitert.",
    "Die Frist wurde von X auf Y verkürzt.",
    "Für ... wurde eine zusätzliche Prüfpflicht eingeführt."
  ]
}
```

Zusätzlich:

```text
change_category
materiality
affected_sections
operational_impact
```

Mögliche Kategorien:

```text
NEW_REQUIREMENT
CHANGED_REQUIREMENT
REMOVED_REQUIREMENT
NEW_REPORTING
CHANGED_REPORTING
NEW_DEADLINE
CHANGED_DEADLINE
SCOPE_CHANGE
GOVERNANCE
AML_CFT
RISK_MANAGEMENT
CAPITAL
LIQUIDITY
DISCLOSURE
OUTSOURCING
ICT
CONDUCT
INVESTMENT_MANAGEMENT
OTHER
```

Zusammenfassungen dürfen keine regulatorischen Tatsachen erfinden.

Jede relevante Aussage soll auf konkrete `section_id`, Textpassagen oder Quelldokumente zurückführbar sein.

---

# 13. Relevanzanalyse

Erzeuge pro Regulatory Event:

```json
{
  "relevant_for": [
    {
      "entity_type": "CREDIT_INSTITUTION",
      "relevance": "HIGH",
      "reason": "...",
      "evidence": [...]
    },
    {
      "entity_type": "AIFM",
      "relevance": "LOW",
      "reason": "...",
      "evidence": [...]
    }
  ]
}
```

Relevanzstufen:

```text
DIRECT
INDIRECT
POSSIBLE
NOT_RELEVANT
```

und optional:

```text
HIGH
MEDIUM
LOW
```

`reason` muss fachlich nachvollziehbar sein.

Beispiel:

> DIRECT für Kreditinstitute, weil Art. X ausdrücklich „credit institutions as defined in ...“ adressiert.

oder:

> INDIRECT für Asset Manager, weil die Änderung Anforderungen an Depositaries betrifft, die für verwaltete Fonds relevant sind.

---

# 14. AMLA als konkreter Referenzadapter

Nutze AMLA als einen der ersten vollständigen End-to-End-Adapter.

Überwache insbesondere relevante Bereiche für:

- Regulatory Instruments
- RTS
- ITS
- Guidelines
- Recommendations
- Public Consultations
- Final Reports
- AML/CFT-relevante Veröffentlichungen

Extrahiere mindestens:

```text
title
document_type
status

publication_date
consultation_start
consultation_deadline

reference_number
legal_basis

affected_topic
explicit_addressees

detail_url
documents[]
attachments[]

full_text
```

Aus Dokumenten zusätzlich:

```text
referenced AMLR articles
AMLD references
AMLA Regulation references
obliged entity definitions
CDD requirements
risk assessment
beneficial ownership
transaction monitoring
reporting
sanctions
governance
outsourcing
cross-border implications
deadlines
transitional periods
```

Danach automatisch:

```text
Was ändert sich?
Für wen?
Warum?
Wann?
Welche Norm?
Welche konkrete Stelle belegt das?
```

---

# 15. Regulatory Event Model

Das eigentliche Produkt des Systems ist nicht ein Scrape, sondern:

```text
RegulatoryEvent
```

Beispielmodell:

```json
{
  "event_id": "...",
  "event_type": "CONSULTATION_STARTED",
  "authority": "AMLA",
  "document_id": "...",
  "title": "...",

  "published_at": "...",
  "effective_from": null,
  "deadline": "...",

  "status": "DRAFT",

  "change_summary": [],
  "changed_sections": [],

  "affected_norms": [],
  "legal_basis": [],

  "relevant_for": [],
  "why_relevant": [],

  "source_evidence": [],
  "confidence": 0.93
}
```

Weitere Eventtypen:

```text
DOCUMENT_PUBLISHED
CONSULTATION_STARTED
CONSULTATION_UPDATED
CONSULTATION_CLOSED

DRAFT_PUBLISHED
FINAL_REPORT_PUBLISHED
FINAL_RULE_PUBLISHED

LAW_ADOPTED
LAW_PROMULGATED
LAW_EFFECTIVE

GUIDELINE_UPDATED
Q_AND_A_UPDATED

COURT_DECISION_PUBLISHED

DOCUMENT_CORRECTED
DOCUMENT_REPEALED
```

---

# 16. Graph Thinking / Regulatory Knowledge Graph

Modelliere Beziehungen explizit.

Nodes:

```text
Document
DocumentVersion
RegulatoryEvent
Norm
Article
Authority
Jurisdiction
EntityType
Requirement
Topic
Consultation
CourtDecision
```

Edges beispielsweise:

```text
AMENDS
REPEALS
IMPLEMENTS
SUPPLEMENTS
CITES
BASED_ON
INTERPRETS
APPLIES_TO
RELEVANT_FOR
SUPERSEDES
VERSION_OF
HAS_SECTION
CREATES_REQUIREMENT
MODIFIES_REQUIREMENT
```

Beispiel:

```text
AMLA RTS
   ──BASED_ON──> AMLR Art. X
   ──APPLIES_TO──> Credit Institution
   ──CREATES_REQUIREMENT──> Enhanced CDD
   ──VERSION_OF──> Previous Draft
```

Implementiere nicht zwingend sofort Neo4j.

Bevorzuge für das MVP PostgreSQL mit relationalen Tabellen und Relation/Edge-Tabellen, sofern dies ausreicht.

Architektur aber so gestalten, dass später Neo4j / graph-native Storage ergänzt werden kann.

---

# 17. Graph-basierte Relevanz

Nutze Beziehungen auch indirekt.

Beispiel:

```text
Dokument
→ ändert AMLR Art. 20
→ AMLR Art. 20 gilt für obliged entities
→ Bank ist obliged entity
→ Dokument ist relevant für Bank
```

oder:

```text
ESMA Guideline
→ betrifft Depositary
→ Depositary betreut AIF
→ Änderung indirekt relevant für AIFM
```

Unterscheide immer:

```text
DIRECT
INDIRECT
INFERRED
```

Graph-Inferenz muss nachvollziehbare Pfade speichern können.

Beispiel:

```json
{
  "relevance_path": [
    "Document X",
    "AMENDS",
    "AMLR Art. 20",
    "APPLIES_TO",
    "AML_OBLIGED_ENTITY",
    "INCLUDES",
    "CREDIT_INSTITUTION"
  ]
}
```

---

# 18. LLM-Schicht

Falls bereits LLM-Unterstützung vorhanden ist, kapsle sie hinter einem Provider Interface.

LLM sinnvoll für:

- Zusammenfassung
- Änderungsinterpretation
- Relevanzklassifikation
- Extraktion schwer strukturierbarer Beziehungen

LLM NICHT als Ersatz für:

- Discovery
- Hashing
- Datumsfelder aus strukturierten Quellen
- IDs
- Versionierung
- deterministische Diffs

Bevorzugter Ablauf:

```text
deterministische Extraktion
        ↓
structural diff
        ↓
relevante Evidenz auswählen
        ↓
LLM structured extraction
        ↓
Schema Validation
        ↓
Persistieren
```

Verwende strukturierte Outputs mit Schema-Validierung.

Speichere außerdem:

```text
model
prompt_version
generated_at
input_document_version
confidence
evidence
```

damit Ergebnisse reproduzierbar bleiben.

---

# 19. Datenhaltung

Bevorzugt:

```text
PostgreSQL
+
Object Storage für Originaldateien
```

Erstelle sinnvolle Tabellen für mindestens:

```text
sources
crawl_runs
raw_documents

documents
document_versions
document_sections

regulatory_events
changes

norms
document_norm_relations

entity_types
document_relevance

graph_nodes / graph_edges
oder äquivalentes relationales Modell
```

Nutze Migrationen.

Keine produktionsrelevanten Daten nur im Dateisystem halten.

---

# 20. Scheduler / Jobs

Source Runs müssen unabhängig laufen können.

Zum Beispiel:

```text
discover_source
fetch_document
parse_document
normalize_document
detect_change
generate_diff
resolve_relations
classify_relevance
generate_summary
create_regulatory_event
```

Jobs möglichst idempotent gestalten.

Ein erneutes Ausführen darf keine Dubletten erzeugen.

Implementiere Retry mit Backoff.

---

# 21. Monitoring des Scrapers

Das System muss erkennen können, wenn ein Scraper zwar technisch erfolgreich läuft, aber fachlich kaputt ist.

Pro Quelle mindestens:

```text
last_check_at
last_success_at
last_document_at

documents_discovered
documents_fetched
documents_changed

parse_success_rate
empty_document_rate
duplicate_rate

http_errors
parse_errors
```

Erkenne Anomalien wie:

```text
Quelle liefert normalerweise Dokumente,
seit mehreren Tagen plötzlich 0.

Parser liefert plötzlich leere Texte.

HTML-Struktur hat sich massiv verändert.
```

---

# 22. Tests

Implementiere:

### Unit Tests
- Parser
- Normalizer
- Date Parsing
- ID Extraction
- Hashing
- Diff Engine
- Relevance Rules

### Fixture Tests
Speichere kleine repräsentative HTML/XML/JSON-Beispiele für jede Quelle.

### Regression Tests
Ein Parser-Update darf bestehende Dokumente nicht plötzlich falsch extrahieren.

### End-to-End Test
Mindestens eine Quelle vollständig:

```text
Discovery
→ Fetch
→ Parse
→ Persist
→ zweite Version
→ Diff
→ Summary
→ Relevance
→ RegulatoryEvent
```

AMLA oder eine besonders gut strukturierte Quelle dafür bevorzugen.

---

# 23. Scraping-Regeln

Implementiere defensiv:

```text
timeouts
retry
exponential backoff
rate limiting
user agent
robots/legal awareness
conditional GET
ETag
Last-Modified
```

Keine aggressiven Request-Raten.

Keine Authentifizierung umgehen.

Keine CAPTCHA- oder Paywall-Umgehung.

---

# 24. Definition of Done für MVP

Das MVP ist fertig, wenn mindestens **3 unterschiedliche Quellentypen** funktionieren, idealerweise:

```text
Gesetze-im-Internet → XML
DIP → API
AMLA oder BaFin → HTML/PDF
```

und ein echter End-to-End-Flow möglich ist:

```text
1. neue Veröffentlichung entdecken
2. Original speichern
3. Metadaten extrahieren
4. Text strukturieren
5. stabile ID bestimmen
6. Normbeziehungen erkennen
7. Version erkennen
8. Änderungen ermitteln
9. 3–7 relevante Änderungsstichpunkte erzeugen
10. relevante Institutstypen bestimmen
11. Relevanz begründen
12. Evidence speichern
13. RegulatoryEvent persistieren
```

Ein Beispieloutput soll ungefähr so aussehen:

```json
{
  "authority": "AMLA",
  "document_type": "RTS",
  "title": "...",
  "status": "FINAL",
  "publication_date": "2026-...",
  "effective_from": "...",

  "changes": [
    {
      "summary": "Neue Anforderungen an ...",
      "change_type": "NEW_REQUIREMENT",
      "affected_section": "Article X",
      "evidence_section_ids": ["..."]
    }
  ],

  "relevance": [
    {
      "entity_type": "CREDIT_INSTITUTION",
      "level": "DIRECT",
      "reason": "...",
      "evidence_section_ids": ["..."]
    },
    {
      "entity_type": "AIFM",
      "level": "INDIRECT",
      "reason": "...",
      "evidence_section_ids": ["..."]
    }
  ],

  "affected_norms": [
    {
      "identifier": "...",
      "relation": "AMENDS"
    }
  ]
}
```

---

# 25. Jetzt konkret vorgehen

Beginne jetzt selbstständig mit:

1. Repository analysieren.
2. Installierte/verfügbare Skills und Tools suchen.
3. Relevante Skills laden und verwenden.
4. Bestehende Architektur und Dependencies bewerten.
5. Einen kurzen technischen Plan erstellen.
6. Datenmodell und Adapter-Abstraktion implementieren.
7. **Gesetze-im-Internet, DIP und AMLA** als erste konkrete Adapter implementieren, sofern keine technischen Gründe für eine leicht andere Reihenfolge sprechen.
8. Original-Storage + Versionierung + Diff implementieren.
9. Norm-/Relation-Modell und Graph-Edges implementieren.
10. Change-Summary + Relevance-Output mit Evidence implementieren.
11. Tests schreiben und tatsächlich ausführen.
12. Fehler selbst beheben.
13. README mit Architektur, Setup, Commands und Hinzufügen einer neuen Quelle ergänzen.

Arbeite bis zu einem **funktionierenden, getesteten Backend-Slice** und nicht nur bis zu Interfaces oder TODO-Dateien.

Wenn das Repository bereits Teile davon enthält, **erweitere die vorhandene Implementierung**, statt parallel eine zweite Architektur aufzubauen.

Zum Abschluss liefere kompakt:

- was implementiert wurde,
- welche Quellen funktionieren,
- welche Tests erfolgreich laufen,
- welche Architekturentscheidungen getroffen wurden,
- welche Punkte als Nächstes für BaFin/EBA/ESMA/EZB/Bundesbank ergänzt werden sollten.