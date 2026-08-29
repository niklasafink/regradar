# LinkedIn-Post-Regeln

Regeln für den vorbefüllten LinkedIn-Post auf den Update-Seiten (`web/app/u/[slug]/page.tsx`,
Button „Auf LinkedIn posten“). Wer den Share-Text-Generator oder die Zusammenfassungen anfasst,
hält sich an diese Regeln.

## Grundsatz

Der Post ist ein sachlicher Fachbeitrag, kein Marketing. Er liest sich wie eine kurze Meldung,
die ein Compliance-Officer selbst geschrieben haben könnte.

## Harte Regeln

1. **Nur ganze Sätze.** Keine Halbsätze, keine Stichpunkte, keine Aufzählungen mit
   Spiegelstrichen oder Bindestrichen.
2. **Keine Metadaten-Zeilen mit Trennzeichen.** Formate wie
   `Leitlinien · ESMA · 27.08.2026: Titel` sind verboten. Die Information aus Typ, Behörde
   und Datum wird stattdessen in einen Satz gegossen.
3. **Keine Gedankenstriche als Gliederung.** Bindestriche in zusammengesetzten Wörtern
   (EU-Kommission, Q&A-Prozess) sind natürlich erlaubt.
4. **Dokumenttitel in Anführungszeichen** („…“), eingeleitet mit Doppelpunkt am Satzende.
5. **Datum im Format TT.MM.JJJJ**, ausgeschrieben im Satz („am 27.08.2026“).
6. **Quellenlink als ganzer Satz**, z. B. „Die vollständige Meldung gibt es hier: {URL}“.
7. **Hashtags nur am Ende**, eine Zeile, maximal vier (Rahmenwerk, Behörde, Compliance, regradar).

## Aufbau

Der Post besteht aus vier Absätzen, getrennt durch Leerzeilen:

1. **Einstiegssatz:** Akteur, Datum, Handlung, Titel.
2. **Inhalt:** erster Absatz der deutschen Zusammenfassung, bei Überlänge an einer
   Satzgrenze gekürzt (nie mitten im Satz abschneiden).
3. **Quellensatz** mit Link zur Original-Meldung.
4. **Hashtag-Zeile.**

## Einstiegssatz

Die Formulierung hängt vom Dokumenttyp und der Behörde ab.

Muster: `{Artikel} {Behörde} hat am {Datum} {Objekt} {Verb}: „{Titel}“.`

Beispiele:

> Die ESMA hat am 27.08.2026 neue Leitlinien veröffentlicht: „Compliance table on the
> Joint Guidelines on costs and losses under DORA“.

> Die BaFin hat am 15.08.2026 ein neues Rundschreiben veröffentlicht: „…“.

> Der BGH hat am 03.08.2026 ein neues Urteil veröffentlicht: „…“.

Wenn es inhaltlich besser passt (bei manuell geschriebenen Posts), sind auch Varianten wie
„Hiermit konkretisiert die ESMA …“ oder „Damit setzt die BaFin … um“ erwünscht — Hauptsache
ein vollständiger, sachlicher Satz.

### Objekt und Verb je Dokumenttyp

| Typ | Objekt | Verb |
| --- | --- | --- |
| Leitlinien | neue Leitlinien | veröffentlicht |
| Konsultation | eine neue Konsultation | gestartet |
| Rundschreiben | ein neues Rundschreiben | veröffentlicht |
| Q&A | neue Q&A | veröffentlicht |
| ITS | neue technische Durchführungsstandards | veröffentlicht |
| Gesetz | ein neues Gesetz | verkündet |
| Gesetzentwurf | einen neuen Gesetzentwurf | vorgelegt |
| Urteil | ein neues Urteil | veröffentlicht |
| Allgemeinverfügung | eine neue Allgemeinverfügung | erlassen |
| Meldung (und alles Unbekannte) | eine neue Meldung | veröffentlicht |

### Artikel je Behörde

Die: BaFin, ESMA, EBA, EIOPA, AMLA, Bundesbank, EZB, EU-Kommission.
Der: BGH, EuGH, Bundestag, EU-Rat, BfDI, EDPB, ESRB, SRB.
Das: BMF, BMI, BSI.
Plural: „Die ESAs haben …“.

Sonderfall Verkündungsorgane (EU-Amtsblatt, Bundesgesetzblatt, Bundesrecht): Passiv-Satz,
z. B. „Im EU-Amtsblatt wurde am {Datum} Folgendes veröffentlicht: „{Titel}“.“ — hier gibt
es keinen handelnden Akteur.

Unbekannte Quellen (roher Hostname) bekommen keinen Artikel: „{Name} hat am … veröffentlicht.“
