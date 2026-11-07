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
export const ART_LABEL: Record<Scope["art"], string> = {
  pflicht: "geltende Pflicht",
  kuenftig: "künftige Pflicht",
  information: "Hinweis",
  keine_institute: "nicht an Institute gerichtet",
};
