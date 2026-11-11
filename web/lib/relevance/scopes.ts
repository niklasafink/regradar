// Anforderungsanalysen je Update (vom Scraper erzeugt, scraper/regradar/scope.py,
// Regeln in scraper/SCOPE.md). Schlüssel ist die URL der Primärquelle. Server-only.

import scopesJson from "./scopes.json";

export interface Group { alle: string[]; hinweis?: string }
export interface Scope {
  art: "pflicht" | "kuenftig" | "information" | "keine_institute";
  kurz: string;
  adressaten: Group[];
  ausschluesse: Group[];
  ebene: "einzel" | "konsolidiert" | "beide";
  teilregeln: { teil: string; gilt_fuer: Group[]; erleichterung: boolean; hinweis: string }[];
  schwellen: { merkmal: string; beschreibung: string }[];
  fragen: { merkmal: string; frage: string }[];
  handlung: string;
  geltung: { ab: string | null; frist: string | null };
  normen: string[];
  belege: string[];
  konfidenz: number;
}

const data = scopesJson as unknown as { format: number; scopes: Record<string, Scope> };

export const SCOPE_FORMAT = data.format ?? 1;
export const scopeFor = (url: string): Scope | undefined => data.scopes[url];

const usable = (s: Scope | undefined): s is Scope => !!s && (s.art === "keine_institute" || s.adressaten.length > 0);

/** Analyse für ein Prüfziel: die eigene des Updates (Schlüssel = URL) bzw.
    des Rahmenwerks (Schlüssel "f:<id>"). Hat ein Update keine brauchbare
    eigene Analyse, gilt die seines Rahmenwerks, sonst die des
    Eltern-Rahmenwerks: Der Adressatenkreis einer Meldung ist in aller Regel
    der des Rechtsakts, zu dem sie gehört. */
export function scopeForTarget(t: { fw: { id: string; parent?: string }; u?: { url?: string } }): Scope | undefined {
  const own = t.u ? (t.u.url ? data.scopes[t.u.url] : undefined) : data.scopes[`f:${t.fw.id}`];
  if (usable(own)) return own;
  const fw = [data.scopes[`f:${t.fw.id}`], t.fw.parent ? data.scopes[`f:${t.fw.parent}`] : undefined].find(usable);
  // Die Art (Pflicht, Hinweis …) bleibt die der Meldung, wenn sie eine eigene Analyse hat.
  const art = (own as Scope | undefined)?.art;
  return fw && art ? { ...fw, art } : fw;
}
export const ART_LABEL: Record<Scope["art"], string> = {
  pflicht: "geltende Pflicht",
  kuenftig: "künftige Pflicht",
  information: "Hinweis",
  keine_institute: "nicht an Institute gerichtet",
};
