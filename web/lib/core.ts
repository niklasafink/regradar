// Leichte Hilfsfunktionen ohne Rahmenwerk-Daten (Datum, Fristen, Behörden,
// Impact, Zielgruppen). Für Client-Komponenten, die nicht das ganze
// Datenpaket aus data.ts/live.json laden sollen; logic.ts exportiert alles erneut.

import { PROVIDERS, TODAY, TOPICS, type Lang, type Topic, type Txt } from "./base";

export const tx = (lang: Lang, t: Txt): string => t[lang] ?? t.de;

/** Beliebige Liste nach Themengebiet gruppiert (Reihenfolge wie TOPICS in
    data.ts), z. B. für Newsletter-Gliederungen nach IT-Governance,
    Meldewesen, Geldwäsche usw. */
export function groupByTopic<T>(
  items: T[],
  topicOf: (item: T) => string,
): { topic: Topic; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = topicOf(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return TOPICS
    .map((topic) => ({ topic, items: groups.get(topic.id) ?? [] }))
    .filter((g) => g.items.length > 0);
}

export const dt = (d: string): Date => {
  const [day, month, year] = d.split(".").map(Number);
  return new Date(year, month - 1, day);
};
export const daysAgo = (d: string): number =>
  Math.round((TODAY.getTime() - dt(d).getTime()) / 86400000);
export const daysUntil = (d: string): number => -daysAgo(d);

/** Abgelaufene Fristen als solche benennen, offene mit Resttagen. */
export const deadlineExpired = (d: string): boolean => daysUntil(d) < 0;
export const deadlineLabel = (lang: Lang, d: string): string => {
  const n = daysUntil(d);
  const date = fmtDate(lang, d);
  if (n < 0) return lang === "de" ? `Frist lief am ${date} aus` : `Deadline expired on ${date}`;
  if (n === 0) return lang === "de" ? `Frist ${date} (heute)` : `Deadline ${date} (today)`;
  return lang === "de" ? `Frist ${date} (${n} Tage)` : `Deadline ${date} (${n} days)`;
};

export const fmtDate = (lang: Lang, d: string): string => {
  if (lang === "de") return d;
  return dt(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/* Quelle -> veröffentlichende Stelle */
const AUTHORITIES: Record<string, string> = {
  "eur-lex.europa.eu": "EU-Amtsblatt",
  "eba.europa.eu": "EBA",
  "esma.europa.eu": "ESMA",
  "eiopa.europa.eu": "EIOPA",
  "amla.europa.eu": "AMLA",
  "bafin.de": "BaFin",
  "bundesbank.de": "Bundesbank",
  "bundesfinanzministerium.de": "BMF",
  "bmi.bund.de": "BMI",
  "dip.bundestag.de": "Bundestag",
  "consilium.europa.eu": "EU-Rat",
  "srb.europa.eu": "SRB",
  "bundesgerichtshof.de": "BGH",
  "esas-joint-committee.europa.eu": "ESAs",
  "recht.bund.de": "BGBl",
  "bankingsupervision.europa.eu": "EZB",
  "gesetze-im-internet.de": "Bundesrecht",
  "edpb.europa.eu": "EDPB",
  "bfdi.bund.de": "BfDI",
  "bsi.bund.de": "BSI",
  "ec.europa.eu": "EU-Kommission",
  "esrb.europa.eu": "ESRB",
  "curia.europa.eu": "EuGH",
  "finance.ec.europa.eu": "EU-Kommission",
  "digital-strategy.ec.europa.eu": "EU-Kommission",
  "europarl.europa.eu": "EU-Parlament",
  "ecb.europa.eu": "EZB",
  "bundestag.de": "Bundestag",
  "cssf.lu": "CSSF",
  "zoll.de": "FIU",
  "fsb.org": "FSB",
  "iosco.org": "IOSCO",
  "bis.org": "BIS",
  "dejure.org": "dejure.org",
};
export const authority = (src: string): string => AUTHORITIES[src] ?? src;

/* Impact-Einschätzung eines Updates: Vorrang hat das LLM-Urteil aus dem
   Scraper (Feld `imp`, Regeln in scraper/IMPACT.md). Fehlt es, greift die
   Heuristik nach Dokumenttyp: verbindliche bzw. finale Akte wiegen schwer,
   Entwürfe und Konsultationen mittel, redaktionelle Hinweise leicht.
   Keine Rechtsberatung. */
export type Impact = "high" | "medium" | "low";

const IMPACT_BY_TYPE: Record<string, Impact> = {
  "Gesetz": "high", "Delegierte VO": "high", "Final Report": "high",
  "Leitlinien": "high", "RTS": "high", "ITS": "high", "Rundschreiben": "high",
  "Allgemeinverfügung": "high", "Urteil": "high", "Rechtsprechung": "high",
  "Taxonomie": "high",
  "Konsultation": "medium", "Gesetzentwurf": "medium",
  "Referentenentwurf": "medium", "Regierungsentwurf": "medium",
  "Kommissionsvorschlag": "medium", "Trilog": "medium", "Bundesrat": "medium",
  "Auslegungshinweise": "medium", "Merkblatt": "medium", "Policy": "medium",
  "Q&A": "low", "Erratum": "low", "Berichtigung": "low",
  "Bericht": "low", "Meldung": "low",
};

export const impactOf = (
  u: { t: Txt; deadline?: string; eff?: string; imp?: Impact },
): Impact =>
  u.imp ?? IMPACT_BY_TYPE[u.t.de] ?? (u.deadline || u.eff ? "high" : "medium");

export const IMPACT_LABEL: Record<Impact, Txt> = {
  high: { de: "Hoch", en: "High" },
  medium: { de: "Mittel", en: "Medium" },
  low: { de: "Gering", en: "Low" },
};

/* Kurzlabels der Anbietertypen für schmale Zielgruppen-Tags. */
export const PROVIDER_SHORT: Record<string, Txt> = {
  CI: { de: "Banken", en: "Banks" },
  AM: { de: "Asset Manager", en: "Asset managers" },
  IF: { de: "Wertpapierinstitute", en: "Investment firms" },
  PI: { de: "Zahlungsinstitute", en: "Payment firms" },
  INS: { de: "Versicherer", en: "Insurers" },
  OTH: { de: "Sonstige", en: "Other" },
};

/* Löst URL-Slug ("bank") oder interne ID ("CI") auf; alte Links mit
   ID-Pfaden (/r/CI) bleiben dadurch funktionsfähig. */
export const providerById = (idOrSlug: string) =>
  PROVIDERS.find((p) => p.slug === idOrSlug || p.id === idOrSlug);
export const providerSlug = (id: string) =>
  PROVIDERS.find((p) => p.id === id)?.slug ?? id;
export const topicById = (id: string) => TOPICS.find((t) => t.id === id);

/** Erster Absatz einer mehrabsätzigen Zusammenfassung (für Listen, E-Mails
 *  und Meta-Descriptions; die Detailseite zeigt alle Absätze). */
export const firstParagraph = (s: string): string =>
  s.split(/\n{2,}/)[0]?.trim() ?? s;
