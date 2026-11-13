import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Board } from "../board-client";
import { boardData } from "../board-data";
import { providerById, subtypeFrameworks } from "@/lib/logic";
import {
  breadcrumbLd, frameworkPath, ldGraph, pageMeta, providerDescription, providerTitle, SITE_URL, title, webPageLd,
} from "@/lib/seo";
import { SUBTYPES, subtypeBySlug } from "@/lib/subtypes";

/* Institutsarten unter „Weitere Institute“: /r/weitere-institute/<art>. */
export function generateStaticParams() {
  const p = providerById("OTH")!;
  return SUBTYPES.map((s) => ({ provider: p.slug, art: s.slug }));
}

const subDescription = (pl: string) =>
  providerDescription(pl, "die Rahmenwerke, Fristen und Konsultationen, die für diese Institutsart gelten");

type Params = Promise<{ provider: string; art: string }>;

function resolve(provider: string, art: string) {
  const p = providerById(provider);
  const s = subtypeBySlug(art);
  return p?.id === "OTH" && s ? { p, s } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { provider, art } = await params;
  const r = resolve(provider, art);
  if (!r) return {};
  return pageMeta({
    title: title(providerTitle(r.s.pl)),
    description: subDescription(r.s.pl),
    path: `/r/${r.p.slug}/${r.s.slug}`,
  });
}

export default async function Page({ params }: { params: Params }) {
  const { provider, art } = await params;
  const r = resolve(provider, art);
  if (!r) notFound();
  const { p, s } = r;
  const all = subtypeFrameworks(s);
  const list = all.filter((f) => !f.parent);
  const path = `/r/${p.slug}/${s.slug}`;
  const ld = ldGraph(
    {
      ...webPageLd({
        path,
        type: "CollectionPage",
        name: providerTitle(s.pl),
        description: subDescription(s.pl),
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
    breadcrumbLd([[p.n.de, `/r/${p.slug}`], [s.n.de, path]]),
  );
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Board p={{ ...p, n: s.n }} {...boardData(p, all, s.slug)} />
    </>
  );
}
