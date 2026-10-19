import type { Metadata } from "next";
import type { ReactNode } from "react";
import { frameworkById } from "@/lib/logic";
import { frameworkDescription, frameworkPath, frameworkTitle, pageMeta, title } from "@/lib/seo";

/* Seitentitel je Rahmenwerk (die Ansicht selbst ist eine Client-Komponente).
   Canonical ist die Seite unter der ersten Zielgruppe, der Inhalt ist unter
   allen Zielgruppen gleich. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const f = frameworkById(id);
  if (!f) return {};
  return pageMeta({
    title: title(frameworkTitle(f.n.de)),
    description: frameworkDescription(f.about.de),
    path: frameworkPath(f),
  });
}

export default function FrameworkLayout({ children }: { children: ReactNode }) {
  return children;
}
