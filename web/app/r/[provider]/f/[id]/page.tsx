import { notFound } from "next/navigation";
import { FrameworkDetail, type LinkedFramework } from "./detail-client";
import { ABOUT_LONG, PROVIDERS, type Framework } from "@/lib/data";
import {
  dt, frameworkById, parentOf, providerById, providerSlug, topicById, visibleFrameworks,
} from "@/lib/logic";
import {
  breadcrumbLd, frameworkDescription, frameworkPath, frameworkTitle, ldGraph, SITE_URL, webPageLd,
} from "@/lib/seo";
import { updateHref } from "@/lib/updates";

/* Daten auf dem Server auflösen und nur dieses Rahmenwerk samt Unterrahmenwerken
   an die Client-Ansicht geben. */
const withHrefs = (x: Framework): LinkedFramework => ({
  ...x,
  u: x.u.map((u) => ({ ...u, href: updateHref(x.id, u) })),
});

/* Alle Rahmenwerke unter jeder ihrer Zielgruppen beim Build vorab rendern. */
export function generateStaticParams() {
  return PROVIDERS.flatMap((p) =>
    visibleFrameworks(p.id, null).map((f) => ({ provider: p.slug, id: f.id })),
  );
}

export default async function Page({ params }: { params: Promise<{ provider: string; id: string }> }) {
  const { provider, id } = await params;
  const p = providerById(provider);
  const f = frameworkById(id);
  if (!p || !f) notFound();
  const t = topicById(f.topic)!;
  const parent = parentOf(f);
  const visible = visibleFrameworks(p.id, null);
  const kids = visible.filter((x) => x.parent === f.id).map(withHrefs);
  const siblings = visible
    .filter((x) => x.topic === f.topic && x.id !== f.id && !x.parent)
    .map((x) => ({ id: x.id, n: x.n, latest: x.latest }));
  // Strukturierte Daten immer zur kanonischen URL (erste Zielgruppe).
  const path = frameworkPath(f);
  const home = providerById(f.ents[0]);
  const linked = withHrefs(f);
  const latest = [...linked.u].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime()).slice(0, 50);
  const ld = ldGraph(
    {
      ...webPageLd({
        path,
        type: "CollectionPage",
        name: frameworkTitle(f.n.de),
        description: frameworkDescription(f.about.de),
      }),
      about: {
        "@type": "Legislation",
        name: f.n.de,
        legislationIdentifier: f.ref,
        ...(f.refUrl ? { url: f.refUrl } : {}),
      },
      ...(latest.length
        ? {
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: latest.length,
              itemListElement: latest.map((u, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: u.ti.de,
                url: `${SITE_URL}${u.href}`,
              })),
            },
          }
        : {}),
    },
    breadcrumbLd([
      [home?.n.de ?? f.ents[0], `/r/${providerSlug(f.ents[0])}`],
      [f.n.de, path],
    ]),
  );
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
    <FrameworkDetail
      p={p}
      f={linked}
      t={t}
      parent={parent ? { id: parent.id, n: parent.n } : undefined}
      kids={kids}
      siblings={siblings}
      aboutLong={ABOUT_LONG[f.id]}
    />
    </>
  );
}
