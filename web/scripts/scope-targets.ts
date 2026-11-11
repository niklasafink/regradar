// Alle Prüfziele der Einschlägigkeit (jedes Update, jedes Rahmenwerk) als
// JSON für die Anforderungsanalyse des Scrapers (scraper/regradar/scope.py).
// Kuratierte Chronologie-Einträge aus data.ts stehen nicht in live.json; ohne
// diese Liste bekämen sie keine Analyse und müssten je Institutsprofil teuer
// per KI abgeglichen werden.
// Aufruf: npx tsx scripts/scope-targets.ts <Ausgabedatei>
import { writeFileSync } from "node:fs";
import { FRAMEWORKS } from "../lib/logic";
import { UPDATE_PAGES } from "../lib/updates";

const out = {
  updates: UPDATE_PAGES.filter((p) => p.u.url).map((p) => ({
    fw: p.fw.id, url: p.u.url, d: p.u.d, t: p.u.t, src: p.u.src, ti: p.u.ti, s: p.u.s,
    deadline: p.u.deadline ?? null, refnum: (p.u as { refnum?: string }).refnum ?? null,
  })),
  frameworks: FRAMEWORKS.map((f) => ({
    id: f.id, jur: f.jur, name: f.n.de, ref: f.ref, ents: f.ents, about: f.about.de, parent: f.parent ?? null,
    condL: f.condL?.de ?? null,
  })),
};
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(`scope-targets: ${out.updates.length} Updates, ${out.frameworks.length} Rahmenwerke`);
