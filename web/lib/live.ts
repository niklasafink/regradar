// Bindet die vom Scraper erzeugten Live-Updates (lib/live.json) an die
// Rahmenwerke aus data.ts. Erzeugen/Aktualisieren mit:
//   cd scraper && python3 -m regradar run all && python3 -m regradar export-web

import { FRAMEWORKS, type Framework, type Update } from "./data";
import liveJson from "./live.json";

/** Aufsichtspraxis-Meldung (Bußgeld, Verwarnung, Maßnahme …) — bewusst kein
 *  regulatorisches Update: eigener Bestand für /praxis und den monatlich
 *  aggregierten Praxis-Newsletter. */
export interface PraxisItem {
  d: string;    // "28.08.2026"
  ti: string;   // Originaltitel
  auth: string; // Behörde ("BaFin")
  src: string;  // Quelldomain ("bafin.de")
  url: string;  // Primärquelle
  cat: "bussgeld" | "zwangsgeld" | "verwarnung" | "massnahme";
  sum?: string; // gescrapte Kurzbeschreibung (Hintergrund, Betragshöhe)
}

export const PRAXIS_CAT_LABELS: Record<PraxisItem["cat"], { de: string; en: string }> = {
  bussgeld: { de: "Bußgeld", en: "Fine" },
  zwangsgeld: { de: "Zwangsgeld", en: "Penalty payment" },
  verwarnung: { de: "Verwarnung", en: "Reprimand" },
  massnahme: { de: "Maßnahme", en: "Measure" },
};

interface LivePayload {
  generated_at: string;
  updates: Record<string, Update[]>;
  praxis?: PraxisItem[];
}

const live = liveJson as LivePayload;

export const LIVE_GENERATED_AT = live.generated_at;

/** Aufsichtspraxis-Meldungen, neueste zuerst. */
export const PRAXIS: PraxisItem[] = live.praxis ?? [];

/** Rahmenwerke mit vorangestellten Live-Updates aus den Primärquellen. */
export const FRAMEWORKS_LIVE: Framework[] = FRAMEWORKS.map((f) => {
  const extra = live.updates[f.id];
  return extra?.length ? { ...f, u: [...extra, ...f.u] } : f;
});
