// llms.txt nach https://llmstxt.org — maschinenlesbare Markdown-Übersicht der
// Seite für LLM-Crawler. Wird aus denselben Daten generiert wie die Sitemap
// und wächst damit automatisch mit jedem Scraper-Export mit.

import { PROVIDERS } from "@/lib/data";
import { authority, FRAMEWORKS, visibleFrameworks } from "@/lib/logic";
import { firstParagraph, UPDATE_PAGES } from "@/lib/updates";

const BASE = process.env.APP_URL ?? "http://localhost:3001";

export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [
    "# Regulatory Radar",
    "",
    "> Kostenloser Regulatory Monitor für Banken, Asset Manager, Wertpapierinstitute, Zahlungsdienstleister und Versicherer in Deutschland und der EU. Bündelt regulatorische Updates (Rundschreiben, Konsultationen, RTS/ITS, Gesetzgebung) aus Primärquellen wie BaFin, EBA, ESMA, EIOPA, EZB und EU-Amtsblatt — sortiert nach Anbietertyp und Rahmenwerk, mit Fristen und Links zur Primärquelle.",
    "",
    "## Anbietertypen",
    "",
    ...PROVIDERS.map(
      (p) => `- [${p.n.de}](${BASE}/r/${p.slug}): ${p.s.de}`,
    ),
    "",
    "## Rahmenwerke",
    "",
  ];

  const seen = new Set<string>();
  for (const p of PROVIDERS) {
    for (const f of visibleFrameworks(p.id, null)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      lines.push(`- [${f.n.de} (${f.ref})](${BASE}/r/${p.slug}/f/${f.id}): ${f.about.de}`);
    }
  }

  const recent = UPDATE_PAGES.slice(0, 50);
  lines.push(
    "",
    "## Aktuelle Updates",
    "",
    ...recent.map(({ slug, fw, u }) => {
      const s = u.s.de ? ` — ${firstParagraph(u.s.de)}` : "";
      return `- [${u.d} · ${u.ti.de}](${BASE}/u/${slug}): ${fw.n.de}, ${authority(u.src)}${s}`;
    }),
    "",
    "## Optional",
    "",
    `- [Sitemap](${BASE}/sitemap.xml): Alle ${UPDATE_PAGES.length} Update-Seiten und ${FRAMEWORKS.length} Rahmenwerke`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
