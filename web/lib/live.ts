// Bindet die vom Scraper erzeugten Live-Updates (lib/live.json) an die
// Rahmenwerke aus data.ts. Erzeugen/Aktualisieren mit:
//   cd scraper && python3 -m regradar run all && python3 -m regradar export-web

import { FRAMEWORKS, type Framework, type PraxisItem, type Update } from "./data";
import liveJson from "./live.json";

export { PRAXIS_CAT_LABELS, type PraxisItem } from "./base";

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
