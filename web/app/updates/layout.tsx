import type { Metadata } from "next";
import type { ReactNode } from "react";
import { breadcrumbLd, description, ldGraph, pageMeta, title, webPageLd } from "@/lib/seo";

const NAME = "Alle regulatorischen Updates aus EU und Deutschland";
const DESCRIPTION = description(
  "Alle regulatorischen Updates aus EU und Deutschland chronologisch: Gesetze, Leitlinien, Konsultationen und Aufsichtsmitteilungen.",
  "Mit Fristen, Impact-Einschätzung und Link zur Primärquelle.",
);

export const metadata: Metadata = pageMeta({
  title: title(NAME),
  description: DESCRIPTION,
  path: "/updates",
});

const LD = ldGraph(
  webPageLd({ path: "/updates", type: "CollectionPage", name: NAME, description: DESCRIPTION }),
  breadcrumbLd([["Alle Updates", "/updates"]]),
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} />
      {children}
    </>
  );
}
