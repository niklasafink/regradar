import type { Metadata } from "next";
import type { ReactNode } from "react";
import { providerById } from "@/lib/logic";

/* Seitentitel je Zielgruppe (die Seite selbst ist eine Client-Komponente). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;
  const p = providerById(provider);
  if (!p) return {};
  return {
    title: `${p.n.de} · Regulatory Radar`,
    description: `Alle relevanten Rahmenwerke und regulatorischen Updates für ${p.n.de}: ${p.s.de}`,
  };
}

export default function ProviderLayout({ children }: { children: ReactNode }) {
  return children;
}
