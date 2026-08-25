// Bindet die vom Scraper erzeugten Live-Updates (lib/live.json) an die
// Rahmenwerke aus data.ts. Erzeugen/Aktualisieren mit:
//   cd scraper && python3 -m regradar run all && python3 -m regradar export-web

import { FRAMEWORKS, type Framework, type Update } from "./data";
import liveJson from "./live.json";

interface LivePayload {
  generated_at: string;
  updates: Record<string, Update[]>;
}

const live = liveJson as LivePayload;

export const LIVE_GENERATED_AT = live.generated_at;

/** Rahmenwerke mit vorangestellten Live-Updates aus den Primärquellen. */
export const FRAMEWORKS_LIVE: Framework[] = FRAMEWORKS.map((f) => {
  const extra = live.updates[f.id];
  return extra?.length ? { ...f, u: [...extra, ...f.u] } : f;
});
