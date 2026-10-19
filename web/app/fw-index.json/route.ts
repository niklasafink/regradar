// Schlanke Rahmenwerkliste (Update-Titel ohne Zusammenfassungen) für die
// Rahmenwerk-Auswahl im Abo-Dialog und die Suche. Wird erst bei Bedarf geladen,
// damit das volle Datenpaket nicht in jedes Seiten-Bundle wandert (lib/fwIndex.ts).

import type { FwLite } from "@/lib/fwIndex";
import { FRAMEWORKS } from "@/lib/logic";

export const dynamic = "force-static";

export function GET() {
  const list: FwLite[] = FRAMEWORKS.map(({ id, n, sn, parent, ref, jur, alias, ents, u }) => ({
    id, n, ref, jur, ents,
    u: u.map(({ d, ti, src, refnum }) => ({ d, ti, src, ...(refnum ? { refnum } : {}) })),
    ...(sn ? { sn } : {}),
    ...(parent ? { parent } : {}),
    ...(alias ? { alias } : {}),
  }));
  return Response.json(list);
}
