import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Offene Fristen · Regulatory Radar",
  description: "Offene Konsultationsfristen und kommende Anwendungstermine für Banken, Asset Manager, Wertpapier-, Zahlungsinstitute und Versicherer.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
