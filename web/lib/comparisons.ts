// Fassungsvergleiche alt gegen neu je Rahmenwerk (Schlüssel = Rahmenwerk-ID).
// Die Zeilen liegen als JSON neben dieser Datei; sie entstehen aus dem Normtext
// beider Fassungen (Wortlaut wörtlich, Prüfung gegen die Quelle) und der
// Begründung des Entwurfs. Keine regulatorische Auskunft.

import type { CmpRow, Comparison } from "./base";
import gwgRows from "./comparisons/gwg-gwbg.json";

const GWG: Comparison = {
  from: {
    n: { de: "Geldwäschegesetz (GwG)", en: "Money Laundering Act (GwG)" },
    ref: "BGBl. 2017 I S. 1822",
    note: {
      de: "Geltendes Recht seit 26.06.2017, zuletzt durch das Zollfinanzgerechtigkeitsgesetz 2026 geändert. Wird zum 10.07.2027 aufgehoben.",
      en: "Law in force since 26 June 2017, last amended by the Customs Financial Justice Act 2026. To be repealed on 10 July 2027.",
    },
  },
  to: {
    n: { de: "Geldwäschebekämpfungsgesetz (GwBG-E)", en: "Money Laundering Prevention Act (GwBG-E)" },
    ref: "Referentenentwurf BMF, Art. 1",
    note: {
      de: "Referentenentwurf vom 28.10.2026, Stellungnahmen bis 19.11.2026, Kabinett laut BMF am 16.12.2026 geplant. Inkrafttreten 10.07.2027.",
      en: "Ministry draft of 28 October 2026, comments due 19 November 2026, cabinet planned by the BMF for 16 December 2026. Entry into force 10 July 2027.",
    },
    url: "https://www.bundesfinanzministerium.de/Content/DE/Gesetzestexte/Gesetze_Gesetzesvorhaben/Abteilungen/Abteilung_VII/21_Legislaturperiode/2026-10-28-E6EUGWRL/0-Gesetz.html",
  },
  intro: {
    de: "Das GwBG-E ersetzt das GwG als neues Stammgesetz. Weil die Geldwäscheverordnung (VO (EU) 2024/1624) ab 10.07.2027 unmittelbar gilt, entfallen Risikomanagement-, Sorgfalts- und Meldepflichten im nationalen Gesetz; geregelt bleiben Verpflichtetenkreis, Transparenzregister, FIU, Aufsicht, Zwangsmittel und Sanktionen. Der Vergleich zeigt je Thema, was wegfällt, was bleibt und was neu ist.",
    en: "The GwBG-E replaces the GwG as a new framework act. Because the AML Regulation (Regulation (EU) 2024/1624) applies directly from 10 July 2027, risk management, due diligence and reporting duties disappear from the national act; the circle of obliged entities, transparency register, FIU, supervision, coercive measures and sanctions remain regulated. The comparison shows per topic what falls away, what stays and what is new.",
  },
  caveat: {
    de: "Entwurf, nicht beschlossen. Fundstellen und Wortlaut folgen dem Referentenentwurf und dem heutigen GwG; die Zusammenfassungen sind redaktionell und ersetzen keine Rechtsprüfung.",
    en: "Draft, not adopted. References and wording follow the ministry draft and the current GwG; the summaries are editorial and are no substitute for legal review.",
  },
  stand: "28.10.2026",
  groups: [
    { id: "enforce", n: { de: "Bußgeld, Zwangsgeld und Veröffentlichung", en: "Fines, periodic penalties and publication" } },
    { id: "transition", n: { de: "Inkrafttreten und Übergang", en: "Entry into force and transition" } },
    { id: "scope", n: { de: "Anwendungsbereich und Verpflichtete", en: "Scope and obliged entities" } },
    { id: "risk", n: { de: "Risikomanagement, interne Sicherungsmaßnahmen, Geldwäschebeauftragter", en: "Risk management, internal safeguards, AML officer" } },
    { id: "cdd", n: { de: "Sorgfaltspflichten, Aufzeichnung, Bargeld", en: "Due diligence, record-keeping, cash" } },
    { id: "reporting", n: { de: "Verdachtsmeldung und FIU", en: "Suspicious activity reports and FIU" } },
    { id: "tr", n: { de: "Transparenzregister", en: "Transparency register" } },
    { id: "property", n: { de: "Immobilien und Glücksspiel", en: "Real estate and gambling" } },
    { id: "super", n: { de: "Aufsicht und Mitwirkungspflichten", en: "Supervision and cooperation duties" } },
  ],
  rows: gwgRows as unknown as CmpRow[],
};

export const COMPARISONS: Record<string, Comparison> = { gwg: GWG };
