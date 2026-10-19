import { notFound } from "next/navigation";
import { Board } from "./board-client";
import { PROVIDERS } from "@/lib/data";
import { childrenOf, PROVIDER_SHORT, providerById, topicsWithContent, visibleFrameworks } from "@/lib/logic";
import {
  breadcrumbLd, frameworkPath, ldGraph, providerDescription, providerTitle, SITE_URL, webPageLd,
} from "@/lib/seo";

/* Kacheldaten auf dem Server berechnen; die Client-Ansicht bekommt nur die
   angezeigten Felder. Kinder erscheinen nur als Chips auf der Elternkachel,
   die Kennzahlen zählen sie mit (wie auf der Startseite). */
/* Alle Zielgruppen beim Build vorab rendern (statt bei jedem Aufruf). */
export function generateStaticParams() {
  return PROVIDERS.map((p) => ({ provider: p.slug }));
}

export default async function Page({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = providerById(provider);
  if (!p) notFound();
  const all = visibleFrameworks(p.id, null);
  const list = all.filter((f) => !f.parent);
  const topics = topicsWithContent(list).map((t) => ({
    id: t.id, n: t.n, d: t.d,
    fws: t.fws.map((f) => ({
      id: f.id, n: f.n, ref: f.ref, jur: f.jur, latest: f.latest,
      count: f.u.length,
      ...(f.u[0]?.src ? { src: f.u[0].src } : {}),
      kids: childrenOf(f.id).map((k) => ({ id: k.id, n: k.n, ...(k.sn ? { sn: k.sn } : {}) })),
    })),
  }));
  const path = `/r/${p.slug}`;
  const ld = ldGraph(
    {
      ...webPageLd({
        path,
        type: "CollectionPage",
        name: providerTitle(PROVIDER_SHORT[p.id]?.de ?? p.n.de),
        description: providerDescription(p.n.de, p.s.de),
      }),
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: list.length,
        itemListElement: list.map((f, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: f.n.de,
          url: `${SITE_URL}${frameworkPath(f)}`,
        })),
      },
    },
    breadcrumbLd([[p.n.de, path]]),
  );
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
    <Board
      p={p}
      frameworkCount={all.length}
      totalUpdates={all.reduce((n, f) => n + f.u.length, 0)}
      listCount={list.length}
      topics={topics}
    />
    </>
  );
}
