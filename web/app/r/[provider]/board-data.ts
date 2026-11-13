import type { Provider } from "@/lib/base";
import { childrenOf, topicsWithContent, type FrameworkView } from "@/lib/logic";
import { frameworkPath } from "@/lib/seo";
import { SUBTYPES } from "@/lib/subtypes";
import type { BoardProps } from "./board-client";

/* Kacheldaten für das Board, gemeinsam für Zielgruppen- und Institutsart-Seiten.
   Kinder erscheinen nur als Chips auf der Elternkachel; `all` enthält sie,
   damit die Kennzahlen sie mitzählen (wie auf der Startseite). Rahmenwerke,
   die nicht zur Zielgruppe gehören (bei Institutsarten möglich), verlinken
   auf ihre kanonische Seite. */
export function boardData(p: Provider, all: FrameworkView[], activeSub?: string): Omit<BoardProps, "p"> {
  const ids = new Set(all.map((f) => f.id));
  const list = all.filter((f) => !f.parent);
  const topics = topicsWithContent(list).map((t) => ({
    id: t.id, n: t.n, d: t.d,
    fws: t.fws.map((f) => ({
      id: f.id, n: f.n, ref: f.ref, jur: f.jur, latest: f.latest,
      href: f.ents.includes(p.id) ? `/r/${p.slug}/f/${f.id}` : frameworkPath(f),
      count: f.u.length,
      ...(f.u[0]?.src ? { src: f.u[0].src } : {}),
      kids: childrenOf(f.id).filter((k) => ids.has(k.id)).map((k) => ({ id: k.id, n: k.n, ...(k.sn ? { sn: k.sn } : {}) })),
    })),
  }));
  return {
    frameworkCount: all.length,
    totalUpdates: all.reduce((n, f) => n + f.u.length, 0),
    listCount: list.length,
    topics,
    ...(p.id === "OTH"
      ? { subnav: SUBTYPES.map((s) => ({ slug: s.slug, n: s.n })), activeSub: activeSub ?? null }
      : {}),
  };
}
