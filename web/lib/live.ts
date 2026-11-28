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

/** Sammelbereich für einschlägige Meldungen ohne Rahmenwerk; erscheint nur, wenn der Vollexport Einträge liefert. */
const SONSTIGE: Framework = {
  id: "sonstige", topic: "GOV", ents: ["CI", "AM", "IF", "PI", "INS", "OTH"], jur: "EU+DE",
  n: { de: "Sonstige einschlägige Meldungen", en: "Other relevant publications" },
  ref: "",
  about: {
    de: "Meldungen der Aufsicht und Gesetzgebung, die für Finanzinstitute einschlägig sind, aber keinem Rahmenwerk zugeordnet werden.",
    en: "Publications by supervisors and legislators that are relevant to financial institutions but not assigned to a framework.",
  },
  cond: null, u: [],
};

/** Rahmenwerke mit vorangestellten Live-Updates aus den Primärquellen. */
export const FRAMEWORKS_LIVE: Framework[] = [
  ...FRAMEWORKS,
  ...(live.updates[SONSTIGE.id]?.length ? [SONSTIGE] : []),
].map((f) => {
  const extra = live.updates[f.id];
  return extra?.length ? { ...f, u: [...extra, ...f.u] } : f;
});
