import {
  QUESTIONS, TOPICS,
  type Cond, type Framework, type Lang, type Topic, type Txt,
} from "./data";
import { FRAMEWORKS_LIVE as FRAMEWORKS } from "./live";

export { FRAMEWORKS };

/* Antworten aus dem Fragebogen: je Frage eine Liste gewählter Werte. */
export type Answers = Record<string, string[]>;

export * from "./core";
import { dt, daysUntil, tx } from "./core";

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
