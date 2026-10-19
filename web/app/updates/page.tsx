import { AllUpdates, type UpdateRow } from "./updates-client";
import { UPDATE_PAGES } from "@/lib/updates";

/* Alle Updates, neueste zuerst; an den Client gehen nur die angezeigten Felder. */
export default function Page() {
  const pages: UpdateRow[] = UPDATE_PAGES.map(({ slug, fw, u }) => ({
    slug,
    fw: { ents: fw.ents, n: fw.n },
    u: {
      d: u.d, src: u.src, t: u.t, ti: u.ti,
      ...(u.deadline ? { deadline: u.deadline } : {}),
      ...(u.eff ? { eff: u.eff } : {}),
      ...(u.imp ? { imp: u.imp } : {}),
    },
  }));
  return <AllUpdates pages={pages} />;
}
