import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PROVIDER_SHORT, providerById } from "@/lib/logic";
import { pageMeta, providerDescription, providerTitle, title } from "@/lib/seo";

/* Seitentitel je Zielgruppe (die Ansicht selbst ist eine Client-Komponente). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;
  const p = providerById(provider);
  if (!p) return {};
  return pageMeta({
    title: title(providerTitle(PROVIDER_SHORT[p.id]?.de ?? p.n.de)),
    description: providerDescription(p.n.de, p.s.de),
    path: `/r/${p.slug}`,
  });
}

export default function ProviderLayout({ children }: { children: ReactNode }) {
  return children;
}
