import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Alle Updates · Regulatory Radar",
  description: "Alle regulatorischen Updates aus EU und Deutschland chronologisch: Gesetze, Leitlinien, Konsultationen und Aufsichtsmitteilungen.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
