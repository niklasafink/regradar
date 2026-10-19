import { AllUpdates, type UpdatesData } from "./updates-client";
import { UPDATE_PAGES } from "@/lib/updates";

/* Alle Updates, neueste zuerst; an den Client gehen nur die angezeigten
   Felder, Rahmenwerke einmal statt in jeder Zeile. */
export default function Page() {
  const index = new Map<string, number>();
  const data: UpdatesData = { fws: [], rows: [] };
  for (const { slug, fw, u } of UPDATE_PAGES) {
    let f = index.get(fw.id);
    if (f === undefined) {
      f = data.fws.push({ ents: fw.ents, n: fw.n }) - 1;
      index.set(fw.id, f);
    }
    data.rows.push({
      slug,
      f,
      u: {
        d: u.d, src: u.src, t: u.t, ti: u.ti,
        ...(u.deadline ? { deadline: u.deadline } : {}),
        ...(u.eff ? { eff: u.eff } : {}),
        ...(u.imp ? { imp: u.imp } : {}),
      },
    });
  }
  return <AllUpdates {...data} />;
}
