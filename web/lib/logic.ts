import {
  PROVIDERS, QUESTIONS, TODAY, TOPICS,
  type Cond, type Framework, type Lang, type Topic, type Txt,
} from "./data";
import { FRAMEWORKS_LIVE as FRAMEWORKS } from "./live";

export { FRAMEWORKS };

/* Antworten aus dem Fragebogen: je Frage eine Liste gewählter Werte. */
export type Answers = Record<string, string[]>;

export const tx = (lang: Lang, t: Txt): string => t[lang] ?? t.de;

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
};
export const authority = (src: string): string => AUTHORITIES[src] ?? src;

const condMet = (cond: Cond | null, answers: Answers | null): boolean => {
  if (!answers || !cond) return true;
  const chosen = answers[cond.k] ?? [];
  return cond.any.some((v) => chosen.includes(v));
};

export interface FrameworkView extends Framework {
  latest: string;
}

/* Rahmenwerke für Anbietertyp und Fragebogen, Updates absteigend datiert. */
export function visibleFrameworks(provider: string, answers: Answers | null): FrameworkView[] {
  return FRAMEWORKS
    .filter((f) => f.ents.includes(provider))
    .filter((f) => condMet(f.cond, answers))
    .map((f) => {
      const u = [...f.u].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime());
      // Rahmenwerke ohne Updates (frisch angebunden) sortieren ans Ende.
      return { ...f, u, latest: u[0]?.d ?? "01.01.2020" };
    })
    .sort((a, b) => dt(b.latest).getTime() - dt(a.latest).getTime());
}

export interface TopicView extends Topic {
  fws: FrameworkView[];
}

export function topicsWithContent(list: FrameworkView[]): TopicView[] {
  return TOPICS
    .map((t) => ({ ...t, fws: list.filter((f) => f.topic === t.id) }))
    .filter((t) => t.fws.length > 0)
    .sort((a, b) => dt(b.fws[0].latest).getTime() - dt(a.fws[0].latest).getTime());
}

export interface ActiveFilter { k: string; v: string; l: Txt }

export function activeFilters(answers: Answers | null): ActiveFilter[] {
  if (!answers) return [];
  const out: ActiveFilter[] = [];
  for (const q of QUESTIONS) {
    for (const v of answers[q.key] ?? []) {
      const o = q.o.find((x) => x.v === v);
      if (o) out.push({ k: q.key, v, l: o.l });
    }
  }
  return out;
}

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
export const frameworkById = (id: string) => FRAMEWORKS.find((f) => f.id === id);
/** Untergeordnete Rahmenwerke (z. B. EBA-Leitlinien zu einem Rechtsakt). */
export const childrenOf = (id: string): Framework[] =>
  FRAMEWORKS.filter((f) => f.parent === id);
export const parentOf = (f: Framework): Framework | undefined =>
  f.parent ? frameworkById(f.parent) : undefined;
/** Anzeigename: Kinder mit Elternpfad, z. B. „CRR III › Ausfalldefinition". */
export const framePath = (lang: Lang, f: Framework): string => {
  const p = parentOf(f);
  return p ? `${tx(lang, p.n)} › ${tx(lang, f.sn ?? f.n)}` : tx(lang, f.n);
};
export const topicById = (id: string) => TOPICS.find((t) => t.id === id);

/* Kommende Fristen aus deadline und eff über alle sichtbaren Rahmenwerke. */
export interface DeadlineItem {
  date: string; kind: "deadline" | "eff"; fw: FrameworkView; title: Txt;
}
export function upcomingDeadlines(list: FrameworkView[]): DeadlineItem[] {
  const out: DeadlineItem[] = [];
  for (const fw of list) {
    for (const u of fw.u) {
      if (u.deadline && daysUntil(u.deadline) >= 0)
        out.push({ date: u.deadline, kind: "deadline", fw, title: u.ti });
      if (u.eff && daysUntil(u.eff) >= 0)
        out.push({ date: u.eff, kind: "eff", fw, title: u.ti });
    }
  }
  return out.sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime());
}
