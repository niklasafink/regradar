// Fassungsvergleiche alt gegen neu je Rahmenwerk (Schlüssel = Rahmenwerk-ID).
// Die Paragrafen-Daten entstehen mit scripts/gwg-compare-build.py aus dem Normtext
// beider Fassungen und der Begründung des Entwurfs (public/cmp/*.json, Kommentare
// aus lib/comparisons/*.json). Keine regulatorische Auskunft.

import type { Comparison, Txt } from "./base";
import outsourcingMeta from "./comparisons/outsourcing.meta.json";
import ebagovMeta from "./comparisons/ebagov.meta.json";
import srepMeta from "./comparisons/srep.meta.json";
import crr3Meta from "./comparisons/crr3.meta.json";
import mariskMeta from "./comparisons/marisk.meta.json";

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
  stand: "28.10.2026",
  paras: "/cmp/gwg-gwbg.json",
  lbl: {
    old: "§ {n} GwG", neu: "§ {n} GwBG-E",
    gone: { de: "fällt künftig in die EU-Geldwäscheverordnung", en: "moves to the EU AML Regulation" },
    newOnly: { de: "Neu im GwBG-E, ohne Vorgänger im GwG", en: "New in the GwBG-E, no predecessor in the GwG" },
    open: { de: "Entwurf öffnen", en: "Open draft" },
    file: "GwG-GwBG-E",
  },
};

/** Meta-Dateien der Builder (scripts/<id>-compare-build.py) in einen Comparison umsetzen. */
interface Meta {
  from: Comparison["from"]; to: Comparison["to"]; stand: string;
  lblOld: string; lblNew: string; goneDe: string; goneEn: string; newOnlyDe: string; newOnlyEn: string;
  aboutDe?: string[]; aboutEn?: string[]; file: string;
}
function fromMeta(m: Meta, openLabel: Txt): Comparison {
  return {
    from: m.from, to: m.to, stand: m.stand, paras: `/cmp/${m.file}.json`,
    about: (m.aboutDe ?? []).map((de, i) => ({ de, en: m.aboutEn?.[i] ?? de })),
    lbl: {
      old: m.lblOld, neu: m.lblNew,
      gone: { de: m.goneDe, en: m.goneEn }, newOnly: { de: m.newOnlyDe, en: m.newOnlyEn },
      open: openLabel, file: m.file,
    },
  };
}
const SRC: Txt = { de: "Quelle öffnen", en: "Open source" };

export const COMPARISONS: Record<string, Comparison> = {
  gwg: GWG,
  outsourcing: fromMeta(outsourcingMeta as Meta, SRC),
  ebagov: fromMeta(ebagovMeta as Meta, SRC),
  srep: fromMeta(srepMeta as Meta, SRC),
  crr3: fromMeta(crr3Meta as Meta, SRC),
  marisk: fromMeta(mariskMeta as Meta, SRC),
};
