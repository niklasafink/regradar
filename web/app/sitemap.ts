import type { MetadataRoute } from "next";
import { PROVIDERS } from "@/lib/data";
import { dt, FRAMEWORKS, visibleFrameworks } from "@/lib/logic";
import { frameworkPath } from "@/lib/seo";
import { UPDATE_PAGES } from "@/lib/updates";

const BASE = process.env.APP_URL ?? "http://localhost:3001";

/* Nur indexierbare, kanonische Adressen: Rahmenwerke einmal unter ihrer
   kanonischen Zielgruppe (frameworkPath), nicht unter jeder Zielgruppe.
   Impressum und Datenschutz sind noindex und fehlen bewusst. */
export default function sitemap(): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/quellen`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/fristen`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/updates`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/praxis`, changeFrequency: "weekly", priority: 0.5 },
  ];

  for (const p of PROVIDERS) {
    const fws = visibleFrameworks(p.id, null);
    out.push({
      url: `${BASE}/r/${p.slug}`,
      changeFrequency: "daily",
      priority: 0.8,
      lastModified: fws[0] ? dt(fws[0].latest) : undefined,
    });
  }

  for (const f of FRAMEWORKS) {
    const latest = [...f.u].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime())[0];
    out.push({
      url: `${BASE}${frameworkPath(f)}`,
      changeFrequency: "weekly",
      priority: 0.6,
      lastModified: latest ? dt(latest.d) : undefined,
    });
  }

  // Jedes Update als eigene, indexierbare Seite.
  for (const { slug, u } of UPDATE_PAGES) {
    out.push({
      url: `${BASE}/u/${slug}`,
      changeFrequency: "monthly",
      priority: 0.7,
      lastModified: dt(u.d),
    });
  }

  return out;
}
