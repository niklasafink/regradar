# Newsletter-QS vor der Freigabe-Mail

Diese Datei ist die Arbeitsanweisung für die Qualitätssicherung des wöchentlichen Update-Newsletters. `newsletter_qa.py` gibt sie jeden Donnerstag als Prompt an Claude Code (headless). Manuelle Sessions folgen ihr ebenfalls, wenn der Nutzer eine Newsletter-QS verlangt. Vorbild ist die QS vom 14.10.2026 (Commits `fe8bd7c`, `f57f5ec`, `df50357`).

## Ablauf und Zweck

Stichtag ist donnerstags um 10:00 UTC. Danach startet der Stundenlauf (`run_hourly.sh`) die QS. Erst wenn sie ihr Ergebnis an `POST /api/newsletter/qa` gemeldet hat, verschickt die Website die Freigabe-Mail an Niklas, zusammen mit dem QS-Bericht. Der Vercel-Cron allein verschickt keine Freigabe-Mail mehr, solange für die Woche keine QS vorliegt.

Ziel: In der Mail an die Abonnenten steht nur, was ein Compliance-Officer im Finanzinstitut als Update braucht. Jede Meldung muss dem richtigen Rahmenwerk zugeordnet sein, das richtige Datum haben und einen deutschen, verständlichen Titel tragen. Dubletten und Rauschen gehören nicht hinein.

## Eingabe

- `scraper/data/newsletter_qa_pending.json`: alle Meldungen, die beim nächsten Versand rausgingen. Felder: `slug`, `date`, `title`, `titleEn`, `type`, `source`, `authority`, `url`, `framework`, `frameworkName`, `parent`, `impact`, `deadline`, `effective`, `summary`.
- Die Regeln in `CLAUDE.md` (Projekt-Root), vor allem „Meldungen zu Rahmenwerken“, „Maßstab für Inhalte“ und „Meldungstitel“. Lies sie zuerst.
- Die Rahmenwerke in `web/lib/data.ts` (IDs, Namen, `parent`, `alias`) und die Impact-Regeln in `scraper/IMPACT.md`.

## Prüfpunkte je Meldung

1. **Rahmenwerk-Zuordnung.** Passt `framework` zum Inhalt? Typische Fehler: Ein Kind-Rahmenwerk (EBA-Leitlinien, RTS/ITS) fängt mit einem generischen Muster Meldungen eines anderen Regimes ab. Ein Rechtsakt wird nur zur Abgrenzung erwähnt. Eine Versicherungsmeldung landet bei Bankenregeln, oder umgekehrt.
2. **Ist es überhaupt ein Update?** Kein Update sind: Maßnahmen gegen ein einzelnes, namentlich genanntes Institut oder einen einzelnen Administrator; Zulassungen einzelner Anbieter; Urteile, die nur einen Einzelfall bestätigen; Veranstaltungs- und Stakeholder-Seiten; Stellungnahmen zu laufenden Entwürfen; reine Steuerthemen; Gesetze, die nur die Aufsichtsbehörde selbst betreffen (z. B. FinDAG); Have-Your-Say-Initiativen, die älter als 365 Tage sind.
3. **Dubletten.** Dasselbe Dokument darf nur einmal erscheinen. Gemeinsame Veröffentlichungen über mehrere Feeds, BaFin-Rundschreiben neben der gleichnamigen Aufsichtsmitteilung und Library-Einträge neben der Pressemitteilung gehören zusammen.
4. **Datum.** `date` muss dem Veröffentlichungsdatum der Primärquelle entsprechen. Prüfe das bei jeder Meldung mit `impact` = high und stichprobenartig bei den übrigen per `curl` gegen `url`. bafin.de blockt WebFetch, nutze dort curl.
5. **Titel.** Deutsch, sinngemäß, höchstens etwa 90 Zeichen. Eigenbegriffe wie DORA, MiCA, RTS/ITS und Q&A bleiben englisch. Keine rohen Kennungen, Aktenzeichen oder Dateinamen als Titel.
6. **Zusammenfassung.** Sie sagt auf hoher Flughöhe, was das Institut tun oder prüfen muss und ab wann. Sie widerspricht der Quelle nicht und enthält keine Paragrafen-Exegese.
7. **Impact, Fristen, Link.** Der Impact ist nach `IMPACT.md` plausibel. Eine `deadline` liegt nicht in der Vergangenheit. `url` führt zur Primärquelle und antwortet nicht mit 404 (`curl -sIL`).

## Wie du Fehler behebst

Behebe die Ursache als Regel, nicht als Einzelfall. Lösche keine Einträge von Hand in `live.json`.

- Falsche Zuordnung: `FRAMEWORK_RULES`, `SOURCE_RULES` oder `TITLE_RULES` in `scraper/regradar/webexport.py`. Die Reihenfolge zählt, spezifische Regeln stehen vor generischen. Kommentiere die Regel wie die Einträge vom 14.10.2026 („QA-Prüfung <Datum>: …“).
- Kein Update: `NOISE`, `INDIVIDUAL_MEASURE_URL`, `EVENT_URL`, `TAX_ONLY` oder `_classify()` in `webexport.py`. Betrifft es den Relevanzfilter, passe den Prompt in `scraper/regradar/llmfilter.py` an und zähle dort `FORMAT` hoch.
- Dubletten: die Dedup-Regeln in `webexport.py` (z. B. `BAFIN_CIRCULAR_NO`, `SHADOW_SOURCES`) oder `scraper/regradar/dedup.py`.
- Falsches Datum: der Adapter in `scraper/regradar/adapters/`.
- Titel: Ist ein Muster betroffen, passe den Prompt-Abschnitt „Titel“ in `scraper/regradar/summarize.py` an und zähle `FORMAT` hoch. Einen einzelnen schlechten Titel nennst du im Bericht als offenen Punkt.
- Impact: Regel in `scraper/IMPACT.md` schärfen und `FORMAT` in `scraper/regradar/impact.py` hochzählen. Mach das nur, wenn die Regel eindeutig falsch ist.

Schreibe zu jeder neuen Regel einen Test in `scraper/tests/test_units.py`, nach dem Muster der Tests vom 14.10.2026. Danach:

```
cd scraper
python3 -m unittest discover -s tests
python3 -m regradar export-web
```

Prüfe in `web/lib/live.json`, dass die beanstandeten Meldungen jetzt richtig zugeordnet oder verschwunden sind.

## Grenzen

- Keine Commits und keine Pushes. Das erledigt `newsletter_qa.py`, wenn die Tests grün sind.
- Ändere nur Dateien unter `scraper/` sowie `web/lib/data.ts` und `web/lib/live.json` (letztere nur über `export-web`). Kein anderer Web-Code.
- Keine Quelle deaktivieren und keine Datenbank-Datei löschen.
- Steht im Prompt „Nur prüfen“, änderst du gar nichts und berichtest nur. Das ist der Fall, wenn das Arbeitsverzeichnis schon vorher Änderungen hatte.
- Bist du bei einer Meldung unsicher, ob sie raus soll, ändere nichts. Nenne sie im Bericht als Entscheidung für Niklas.

## Ergebnis

Schreibe zum Schluss `scraper/data/newsletter_qa_result.json`:

```json
{"ok": true, "report": "…"}
```

- `ok` ist `true`, wenn nach deinen Korrekturen nichts offen ist. Es ist `false`, wenn Niklas vor der Freigabe etwas entscheiden oder prüfen muss.
- `report` ist deutscher Klartext für Niklas, höchstens etwa 15 Zeilen, ohne Markdown-Überschriften:
  - eine Zeile „Geprüft: N Meldungen“,
  - „Behoben:“ mit je einer Zeile pro Korrektur (Meldung, was falsch war, welche Regel),
  - „Zur Entscheidung:“ mit je einer Zeile pro offenem Punkt und deiner Empfehlung,
  - fehlt beides, dann „Keine Auffälligkeiten.“
