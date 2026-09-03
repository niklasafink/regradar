import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Aufsichtspraxis · Regulatory Radar",
  description: "Einzelfall-Maßnahmen der Aufsicht: Bußgelder, Verwarnungen und Anordnungen der BaFin.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
