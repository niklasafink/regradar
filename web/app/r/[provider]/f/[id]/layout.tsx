import type { Metadata } from "next";
import type { ReactNode } from "react";
import { frameworkById } from "@/lib/logic";

/* Seitentitel je Rahmenwerk (die Seite selbst ist eine Client-Komponente). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const f = frameworkById(id);
  if (!f) return {};
  return {
    title: `${f.n.de} · Regulatory Radar`,
    description: f.about.de,
  };
}

export default function FrameworkLayout({ children }: { children: ReactNode }) {
  return children;
}
