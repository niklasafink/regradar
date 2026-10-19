// Fristen-Ansicht: alle offenen Konsultationsfristen und kommenden
// Anwendungsdaten über sämtliche Rahmenwerke, nach Datum aufsteigend.

import { Deadlines, type DeadlineEntry } from "./deadlines-client";
import { daysUntil, dt } from "@/lib/logic";
import { UPDATE_PAGES } from "@/lib/updates";

/* Offene Fristen aus deadline (Konsultation) und eff (Anwendungsbeginn);
   an den Client gehen nur die angezeigten Felder. */
function openItems(): DeadlineEntry[] {
  const out: DeadlineEntry[] = [];
  for (const { slug, fw, u } of UPDATE_PAGES) {
    const base = {
      slug,
      fw: { ents: fw.ents, n: fw.n },
      u: { d: u.d, src: u.src, t: u.t, ti: u.ti },
    };
    if (u.deadline && daysUntil(u.deadline) >= 0)
      out.push({ ...base, date: u.deadline, kind: "deadline" });
    if (u.eff && daysUntil(u.eff) >= 0)
      out.push({ ...base, date: u.eff, kind: "eff" });
  }
  return out.sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime());
}

export default function Page() {
  return <Deadlines items={openItems()} />;
}
