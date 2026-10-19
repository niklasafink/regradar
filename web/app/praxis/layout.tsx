import type { Metadata } from "next";
import type { ReactNode } from "react";
import { breadcrumbLd, description, ldGraph, pageMeta, title, webPageLd } from "@/lib/seo";

const NAME = "Aufsichtspraxis: Bußgelder und Maßnahmen der Aufsicht";
const DESCRIPTION = description(
  "Einzelfall-Maßnahmen der Aufsicht: Bußgelder, Verwarnungen und Anordnungen der BaFin.",
  "Dazu Reden und Interviews von Aufsichts- und Zentralbank-Vertretern, mit Link zur Primärquelle.",
);

export const metadata: Metadata = pageMeta({
  title: title(NAME),
  description: DESCRIPTION,
  path: "/praxis",
});

const LD = ldGraph(
  webPageLd({ path: "/praxis", type: "CollectionPage", name: NAME, description: DESCRIPTION }),
  breadcrumbLd([["Aufsichtspraxis", "/praxis"]]),
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} />
      {children}
    </>
  );
}
