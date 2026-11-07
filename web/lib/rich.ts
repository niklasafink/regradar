// Angereicherte Detailseiten: Felder, die die Pipeline (scraper/richpages.py)
// je Meldung mit einem Sonnet-Aufruf erzeugt und regelbasiert prüft. Seite,
// Grafiken und strukturierte Daten baut components/rich-update.tsx daraus.
import RICH from "./rich.json";

export type RichAudience = { name: string; note: string; detail: string; status: "betroffen" | "teilweise" | "nicht betroffen" };
export type RichUpdate = {
  h1: string;
  seo_title: string;
  meta_description: string;
  lead: string;
  aka: string[];
  summary: string;
  overview: string[];
  facts: { label: string; value: string }[];
  audience: RichAudience[];
  changes: { ref: string; title: string; text: string }[];
  todos: string[];
  timeline: { date: string; label: string; kind: "schritt" | "kern" | "frist" }[];
  faq: { q: string; a: string }[];
  impact: "hoch" | "mittel" | "gering";
  open_points: string[];
  meta: { generated: string; model: string; source: string; dropped: number };
};

const DATA = RICH as Record<string, RichUpdate>;

export function richBySlug(slug: string): RichUpdate | undefined {
  return DATA[slug];
}

/** Meta-Beschreibung auf höchstens `max` Zeichen, bevorzugt an einer Satzgrenze. */
export function trimDescription(s: string, max = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.endsWith(".") ? cut.length - 1 : -1);
  if (end >= 110) return cut.slice(0, end + 1);
  return `${cut.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,;:]+$/, "")}…`;
}
