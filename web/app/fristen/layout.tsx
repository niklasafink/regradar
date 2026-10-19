import type { Metadata } from "next";
import type { ReactNode } from "react";
import { breadcrumbLd, description, ldGraph, pageMeta, title, webPageLd } from "@/lib/seo";

const NAME = "Offene Fristen: Konsultationen und Anwendungstermine";
const DESCRIPTION = description(
  "Offene Konsultationsfristen und kommende Anwendungstermine für Banken, Asset Manager, Wertpapier-, Zahlungsinstitute und Versicherer.",
  "Nach Datum sortiert, mit Link zur Primärquelle.",
);

export const metadata: Metadata = pageMeta({
  title: title(NAME),
  description: DESCRIPTION,
  path: "/fristen",
});

const LD = ldGraph(
  webPageLd({ path: "/fristen", type: "CollectionPage", name: NAME, description: DESCRIPTION }),
  breadcrumbLd([["Offene Fristen", "/fristen"]]),
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} />
      {children}
    </>
  );
}
