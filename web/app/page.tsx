import type { Metadata } from "next";
import { HomeClient, type HomeData } from "./home-client";
import { PROVIDERS } from "@/lib/data";
import { FRAMEWORKS } from "@/lib/logic";
import {
  HOME_DESCRIPTION, HOME_TITLE, ldGraph, organizationLd, pageMeta, webPageLd, websiteLd,
} from "@/lib/seo";
import { UPDATE_PAGES } from "@/lib/updates";

export const metadata: Metadata = pageMeta({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
});

export default function Home() {
  /* Neueste Einträge, identisch zur Ansicht auf /updates. Nur die angezeigten
     Felder gehen an den Client. */
  const data: HomeData = {
    frameworkCount: FRAMEWORKS.length,
    totalUpdates: FRAMEWORKS.reduce((n, f) => n + f.u.length, 0),
    providerCounts: Object.fromEntries(
      PROVIDERS.map((p) => [p.id, FRAMEWORKS.filter((f) => f.ents.includes(p.id)).length]),
    ),
    recent: UPDATE_PAGES.slice(0, 6).map(({ slug, fw, u }) => ({
      slug,
      fw: { n: fw.n },
      u: {
        d: u.d, ti: u.ti, t: u.t, src: u.src,
        ...(u.deadline ? { deadline: u.deadline } : {}),
        ...(u.eff ? { eff: u.eff } : {}),
        ...(u.imp ? { imp: u.imp } : {}),
      },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldGraph(
            organizationLd,
            websiteLd,
            webPageLd({ path: "/", name: HOME_TITLE, description: HOME_DESCRIPTION }),
          ),
        }}
      />
      <HomeClient {...data} />
    </>
  );
}
