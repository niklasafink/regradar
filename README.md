# regradar

**Regulatorisches Monitoring für die deutsche Finanzindustrie** — live unter [regradar.de](https://regradar.de)

regradar beobachtet die relevanten europäischen und deutschen Regulierungsquellen und macht daraus einen kuratierten, verständlichen Überblick: Wer ist betroffen, was ändert sich, welche Fristen laufen. Statt dutzende Behördenseiten, Newsletter und Amtsblätter zu verfolgen, gibt es eine Seite, die den Stand pro Rahmenwerk zeigt — von DORA über MiCA bis zum AI Act.

## Vision

Regulatorische Änderungen erreichen die Praxis heute meist über Umwege: Kanzlei-Mailings, Konferenzfolien, Flurfunk. Die Primärquellen (EUR-Lex, BaFin, EBA, ESMA, …) sind öffentlich, aber verstreut, unterschiedlich strukturiert und in Behördensprache verfasst.

regradar setzt direkt an den Primärquellen an und übersetzt sie in Arbeitsnutzen:

- **Vollständigkeit vor Auswahl** — alle relevanten Meldungen der überwachten Behörden, nicht nur das, was gerade Konferenzthema ist.
- **Einordnung statt Rohdaten** — jede Meldung wird einem Rahmenwerk zugeordnet, zusammengefasst und mit einer Impact-Einschätzung für die Zielgruppe versehen.
- **Primärquelle immer verlinkt** — regradar ersetzt keine Rechtsberatung; jeder Eintrag führt mit einem Klick zum Originaldokument.

## Was regradar heute bietet

- **74 Rahmenwerke** (EU, DE und LU) mit Zeitleiste, Kurzprofil und Betroffenheitslogik — u. a. DORA, NIS2, MiCA, CRR III, MaRisk, WpI-MaRisk, AIFMD II, Solvency II, DSGVO, AI Act, CSRD.
- **27 Primärquellen** werden laufend überwacht: EU-Ebene (EUR-Lex, EBA inkl. Single Rulebook Q&A, ESMA, EIOPA, EZB-Bankenaufsicht, SRB, ESRB, AMLA, EDPB, EuGH, EU-Kommission), Bund (BaFin, Bundesbank, BSI, BfDI, BMF, FIU, Bundesgesetzblatt, DIP Bundestag, Gesetze im Internet, Rechtsprechung im Internet) und internationale Standardsetzer (Basler Ausschuss/BIS, FSB, IOSCO).
- **Stündliche Aktualisierung**: Der Scraper läuft einmal pro Stunde über alle Quellen; neue Meldungen erscheinen automatisch auf der Seite.
- **LLM-gestützte Aufbereitung**: Relevanzfilter, verständliche Anzeigetitel (keine kryptischen Dokumentnummern), mehrabsätzige Zusammenfassungen (Inhalt / Relevanz / Fristen) und eine Impact-Einstufung (high / medium / low).
- **Fachliche Einordnung durch Beratungspraxis**: Zu Behördenmeldungen werden passende Fachbeiträge von PwC, KPMG, Deloitte u. a. verlinkt („So kommentieren die Big 4").
- **Newsletter**: Abonnenten erhalten neue Meldungen zu ihren Rahmenwerken per E-Mail, plus eine wöchentliche Übersicht neuer Rahmenwerke in der Datenbank.
- **Frühwarnsignale**: Gesetzgebungsvorhaben aus DIP (Bundestag/Bundesrat) und der EU-Konsultationsplattform „Have Your Say" erscheinen, bevor daraus verbindliches Recht wird.

## Wie die Daten entstehen

Der Weg von der Behördenmeldung bis zur Seite:

1. **Discovery** — Pro Quelle greift ein Adapter auf den stabilsten verfügbaren Zugriffsweg zu (Priorität: API > XML > JSON > RSS > Sitemap > HTML > PDF). Quellen mit Bot-Schutz werden nicht umgangen, sondern nur mit Metadaten geführt oder ausgelassen.
2. **Normalisierung** — Dokumente bekommen stabile Identifikatoren (CELEX/ELI, ECLI, ESMA-Nummern, Geschäftszeichen), Versionen werden erkannt und dedupliziert. Publikationsdaten entsprechen immer dem Original der Quelle.
3. **Zuordnung** — Ein Regelwerk aus Schlüsselwort-Mustern ordnet jede Meldung einem Rahmenwerk zu; offensichtliches Rauschen (Veranstaltungen, Anbieterwarnungen, Bußgeldmeldungen) wird ausgefiltert.
4. **LLM-Pipeline** — Ein Relevanzfilter prüft jeden Kandidaten, danach entstehen Zusammenfassung, Anzeigetitel und Impact-Urteil aus dem Volltext der Originalmeldung (HTML, bei Bedarf das verlinkte PDF). Alle Urteile werden gecacht, damit identische Dokumente nicht mehrfach bewertet werden.
5. **Export** — Das Ergebnis landet als kompaktes JSON im Frontend und wird deployt; die Web-App mischt die Live-Meldungen in die Zeitleisten der Rahmenwerke.

Parallel sammelt ein eigener Lauf Fachbeiträge der großen Beratungsgesellschaften ein und lässt pro Behördenmeldung entscheiden, welche Beiträge genau diese Meldung kommentieren (Zeitfenster ±14 Tage). Ein Gap-Report meldet umgekehrt Kanzlei-Beiträge, die zu keiner gescrapten Behördenmeldung passen — Kandidaten für neue Quellen.

## Architektur

```
scraper/   Python-Backend (nur Standardbibliothek, Python >= 3.9)
           - regradar/adapters/  ein Adapter pro Quelle bzw. Quelltyp
           - SQLite als Speicher (Dokumente, Versionen, Events, LLM-Caches)
           - CLI: python3 -m regradar {init, run, big4, export-web, ...}
           - LLM-Aufrufe über OpenRouter (Filter, Titel, Summary, Impact)

web/       Next.js-App (App Router, TypeScript), deployt auf Vercel
           - lib/live.json       stündlicher Scraper-Export
           - lib/data.ts         Rahmenwerk-Stammdaten und Betroffenheitslogik
           - Newsletter-Versand über Resend, Abonnenten-State in Redis
```

Bewusste Entscheidungen:

- **Kein Framework im Scraper.** Der Crawler kommt ohne Drittabhängigkeiten aus — keine Dependency-Pflege, reproduzierbare Läufe, trivialer Betrieb.
- **SQLite statt Datenbank-Server.** Das Datenvolumen (Metadaten + Volltexte von Behördenmeldungen) braucht keinen Server; die gesamte Historie ist eine Datei.
- **Statischer Export statt Live-Backend.** Das Frontend liest ein generiertes JSON; die Seite bleibt schnell, günstig und hat keine Laufzeit-Abhängigkeit zum Scraper.
- **LLM nur mit Cache und Fallback.** Ohne API-Key läuft die Pipeline vollständig weiter (Regex-Filter, Original-Teaser, Typ-Heuristik für den Impact); das LLM verbessert, es blockiert nicht.

## Entwicklung

Scraper:

```bash
cd scraper
python3 -m regradar init          # DB anlegen, Quellen-Registry seeden
python3 -m regradar run all       # alle Quellen crawlen
python3 -m regradar run bafin     # einzelne Quelle
python3 -m regradar sources       # Quellen-Status
python3 -m regradar export-web    # web/lib/live.json schreiben
```

Web-App:

```bash
cd web
npm install
npm run dev                       # http://localhost:3000
```

Details zu Quellen, Endpunkten und Pipeline stehen in [scraper/README.md](scraper/README.md) und [scraper/SOURCES.md](scraper/SOURCES.md).

## Hinweis

regradar ist ein Informationsangebot und keine Rechtsberatung. Maßgeblich ist immer das verlinkte Originaldokument der jeweiligen Behörde.
