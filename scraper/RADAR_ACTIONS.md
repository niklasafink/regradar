# Radar-Entscheidungen: Analyse und Umsetzung

Diese Datei ist die Arbeitsanweisung für `radar_actions.py`. Der Stundenlauf übergibt sie zusammen mit einem Punkt der Radar-Checkliste an Claude Code (headless). Die Punkte stammen aus der Checklisten-Mail (`scraper/regradar/gapreport.py`); Niklas entscheidet über einen Link im Browser (`/api/radar/item`).

Maßstab ist immer die Sicht eines Compliance-Officers im Finanzinstitut (Regeln in `CLAUDE.md`, Abschnitte „Maßstab für Inhalte“, „Meldungen zu Rahmenwerken“, „Meldungstitel“). Lies sie zuerst. Steuerthemen sind out of scope, Einzelinstitut-Meldungen und wirkungslose Urteile sind kein Update.

## Eingabe

`scraper/data/radar_item.json` mit: `kind` (dublette, rahmenwerk, scraper), `title`, `detail`, `links` (Quellen), `codes` (erlaubte Entscheidungscodes), `recommendation` (Vorschlag des LLM aus der Mail), `meta`, `comment` (Anweisung von Niklas, kann leer sein), `analysis` (frühere Analyse, falls Niklas neu bewerten lässt).

Die Anweisung in `comment` hat Vorrang vor deiner eigenen Einschätzung und vor der Empfehlung, solange sie nicht gegen die Regeln in `CLAUDE.md` verstößt. Tut sie das, sag es im Bericht und setze sie nicht um.

## Modus „Analyse“

Du änderst keine Dateien außer der Ergebnisdatei. Erstelle eine begründete Einschätzung:

1. Ruf die Quellen in `links` ab (`curl -sL`, bafin.de blockt WebFetch). Prüfe Datum, Inhalt und ob es dieselbe oder eine andere Meldung ist.
2. Gleiche mit dem Bestand ab: Rahmenwerke in `web/lib/data.ts` (`id`, `alias`, `ref`), Zuordnungsregeln `FRAMEWORK_RULES` in `scraper/regradar/webexport.py`, Quellen in `scraper/SOURCES.md` und `scraper/regradar/registry.py`.
3. Nach Art:
   - **dublette**: Sind es dasselbe Dokument, eine Neufassung oder verschiedene Sachverhalte? Welcher Eintrag ist maßgeblich? Ist der Punkt überhaupt eine Aufnahme wert (Einzelinstitut, Anschriftsänderung)?
   - **rahmenwerk**: Gibt es den Rechtsakt schon in der Bibliothek (auch als Kind oder unter anderem Namen)? Ist er für Institute handlungsrelevant? Bei `aufnehmen`: Rechtsakt, Datum und Primärquelle nennen (EUR-Lex per Cellar-SPARQL, siehe Memory „EUR-Lex per Cellar-SPARQL“, DIP-API für deutsche Gesetze).
   - **scraper**: Fehlt wirklich eine Primärquelle? Welche Behörde/Seite, gibt es einen RSS-Feed oder eine Liste? Oder ist das Thema über eine vorhandene Quelle abgedeckt?
4. Schreibe `scraper/data/radar_result.json`:

```json
{"proposal": "Begründeter Vorschlag in 4 bis 10 Sätzen, deutsch, ohne Versalien, nenne konkret, was bei Umsetzung passiert.",
 "code": "<einer der erlaubten Codes>",
 "links": [{"label": "Kurzbeschreibung", "url": "https://…"}]}
```

`links` sind die Belege, die du selbst abgerufen hast (Primärquelle, Bibliotheks-Eintrag, Gesetzestext). Keine erfundenen URLs.

## Modus „Umsetzung“

Niklas hat den Code in `decision.code` freigegeben. Setze genau das um, nichts darüber hinaus.

- **aufnehmen** (Rahmenwerk): Neues Rahmenwerk in `web/lib/data.ts` nach dem Muster der vorhandenen (Felder `about`, `n`, `alias`, `ref`, `refUrl`, `ents`, `topic`, `u`). Die Chronologie nur aus geprüften Primärquellen, ein Eintrag pro Quelldokument, hohe Flughöhe, `url` zur Quelle. Zuordnungsregel in `FRAMEWORK_RULES` (`webexport.py`), spezifisch vor generisch. Vorbild: `dltpilot`, `bcbs`.
- **neue-quelle** (Scraper): Adapter in `scraper/regradar/adapters/` und Eintrag in `registry.py` nach Vorbild einer ähnlichen Quelle, Eintrag in `scraper/SOURCES.md`. Einen Probelauf mit `python3 -m regradar run <quelle>` machen, Datum der Treffer gegen die Originalseiten prüfen.
- Schreibe zu jeder neuen Regel einen Test in `scraper/tests/test_units.py`.

Erlaubte Pfade für Änderungen: `scraper/regradar/`, `scraper/tests/`, `scraper/SOURCES.md`, `scraper/IMPACT.md`, `web/lib/data.ts`, `web/lib/live.json`, `web/lib/sources.json`. Alles andere wird verworfen. Starte `python3 -m unittest discover -s tests` (im Ordner `scraper`) vor dem Abschluss. Die Datei `live.json` erzeugt der Stundenlauf selbst (`export-web`), editiere sie nicht von Hand.

Findest du bei der Umsetzung einen Grund, der gegen die Freigabe spricht (etwa: Rahmenwerk existiert doch schon), ändere nichts und melde `ok: false` mit Begründung.

Schreibe `scraper/data/radar_result.json`:

```json
{"ok": true, "report": "Was geändert wurde, in 3 bis 8 Sätzen, mit Dateinamen. Offene Punkte nennen."}
```

## Stil

Deutsch, ohne Versalien (auch keine Labels in Großbuchstaben), sachlich und knapp.
