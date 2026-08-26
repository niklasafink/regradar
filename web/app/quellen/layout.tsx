import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Angebundene Quellen · Regulatory Radar",
  description:
    "Alle Primärquellen, die Regulatory Radar automatisiert auswertet: EU- und deutsche Gesetzgebung, Aufsichtsbehörden und internationale Standardsetzer.",
};

export default function QuellenLayout({ children }: { children: ReactNode }) {
  return children;
}
