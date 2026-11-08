// Kontext-Layer für Policies (Conformis „Policy schreiben“): je Policy-Thema und
// Institutsprofil die Normen, die eine Richtlinie regelmäßig umsetzen muss.
// Daten in library.json; Merkmale wie im Einschlägigkeits-Abgleich (relevance/catalog.json).

import libraryJson from "./library.json";
import { FEATURE_IDS, GATTUNG_RULES, LICENSE_RULES } from "@/lib/relevance/catalog";

type Txt = { de: string; en: string };
export type Level = "kern" | "teilweise" | "auslegung" | "optional";

export interface PolicyProfile { id: string; l: Txt; any: string[] }
export interface PolicyFramework { n: string; ref: string; rr: string | null; conformis: string | null }
export interface PolicyEntry {
  fw: string;
  p: string[];
  lv: Level;
  when?: { any: string[]; l?: Txt };
  norms: string[];
  why: Txt;
}
export interface PolicyTopic { id: string; l: Txt; syn: string[]; focus: string[]; entries: PolicyEntry[] }
export interface PolicyLibrary {
  format: number;
  updated: string;
  note: string;
  profiles: PolicyProfile[];
  frameworks: Record<string, PolicyFramework>;
  topics: PolicyTopic[];
}

export const POLICY_LIBRARY = libraryJson as unknown as PolicyLibrary;

/** Bibliothek samt Regeln, mit denen ein Abnehmer aus Registerangaben Merkmale ableitet. */
export function exportLibrary() {
  const rule = ([re, ids]: [RegExp, string[]]) => ({ re: re.source, flags: re.flags, ids });
  return {
    ...POLICY_LIBRARY,
    featureRules: { gattung: GATTUNG_RULES.map(rule), license: LICENSE_RULES.map(rule) },
  };
}

/** Thema zu einem Policy-Namen (Synonyme im Namen), sonst null. */
export function topicFor(name: string): PolicyTopic | null {
  const text = name.toLowerCase();
  return (
    POLICY_LIBRARY.topics.find((t) => t.id === text) ??
    POLICY_LIBRARY.topics.find((t) => t.syn.some((s) => text.includes(s))) ??
    null
  );
}

export function profilesFor(features: ReadonlySet<string>): PolicyProfile[] {
  return POLICY_LIBRARY.profiles.filter((p) => p.any.some((f) => features.has(f)));
}

export type ResolvedEntry = {
  framework: string;
  name: string;
  ref: string;
  conformis: string | null;
  level: Level;
  norms: string[];
  why: string;
  /** optional: Merkmal trifft zu (true), nicht bekannt (null). */
  condition: { label: string; met: boolean | null } | null;
};

/**
 * Liste für ein Thema und die Merkmale eines Instituts. Kern- und Teilnormen der Profile,
 * Optionales nur, wenn ein Merkmal zutrifft oder unbekannt ist (dann als Prüffrage).
 * `known` sind Merkmale, deren Fehlen sicher heißt, dass sie nicht zutreffen.
 */
export function resolve(
  topic: PolicyTopic,
  features: ReadonlySet<string>,
  locale: "de" | "en" = "de",
  known: ReadonlySet<string> = new Set(),
): ResolvedEntry[] {
  const profiles = new Set(profilesFor(features).map((p) => p.id));
  const out: ResolvedEntry[] = [];
  for (const entry of topic.entries) {
    if (!entry.p.includes("*") && !entry.p.some((p) => profiles.has(p))) continue;
    let condition: ResolvedEntry["condition"] = null;
    if (entry.when) {
      const met = entry.when.any.some((f) => features.has(f));
      const unknown = !met && entry.when.any.some((f) => FEATURE_IDS.has(f) && !known.has(f));
      if (!met && !unknown) continue;
      if (!met && entry.lv !== "optional" && entry.lv !== "auslegung") continue;
      condition = { label: entry.when.l?.[locale] ?? entry.when.any.join(", "), met: met ? true : null };
    }
    const fw = POLICY_LIBRARY.frameworks[entry.fw];
    out.push({
      framework: entry.fw,
      name: fw?.n ?? entry.fw,
      ref: fw?.ref ?? "",
      conformis: fw?.conformis ?? null,
      level: entry.lv,
      norms: entry.norms,
      why: entry.why[locale],
      condition,
    });
  }
  return out;
}
