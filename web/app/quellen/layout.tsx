import type { Metadata } from "next";
import type { ReactNode } from "react";
import { breadcrumbLd, description, ldGraph, pageMeta, title, webPageLd } from "@/lib/seo";

const NAME = "Angebundene Quellen: Aufsichtsbehörden und Gesetzgebung";
const DESCRIPTION = description(
  "Alle Primärquellen, die Regulatory Radar automatisiert auswertet: EU- und deutsche Gesetzgebung, Aufsichtsbehörden und internationale Standardsetzer.",
  "Mit Zugriffsweg und Link zu jeder Quelle.",
);

export const metadata: Metadata = pageMeta({
  title: title(NAME),
  description: DESCRIPTION,
  path: "/quellen",
});

const LD = ldGraph(
  webPageLd({ path: "/quellen", type: "WebPage", name: NAME, description: DESCRIPTION }),
  breadcrumbLd([["Angebundene Quellen", "/quellen"]]),
);

export default function QuellenLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} />
      {children}
    </>
  );
}
