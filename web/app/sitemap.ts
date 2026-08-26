import type { MetadataRoute } from "next";
import { PROVIDERS } from "@/lib/data";
import { dt, visibleFrameworks } from "@/lib/logic";
import { UPDATE_PAGES } from "@/lib/updates";

const BASE = process.env.APP_URL ?? "http://localhost:3001";

export default function sitemap(): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/quellen`, changeFrequency: "weekly", priority: 0.5 },
  ];

  for (const p of PROVIDERS) {
    const fws = visibleFrameworks(p.id, null);
    out.push({
      url: `${BASE}/r/${p.id}`,
      changeFrequency: "daily",
      priority: 0.8,
      lastModified: fws[0] ? dt(fws[0].latest) : undefined,
    });
    for (const f of fws) {
      out.push({
        url: `${BASE}/r/${p.id}/f/${f.id}`,
        changeFrequency: "weekly",
        priority: 0.6,
        lastModified: dt(f.latest),
      });
    }
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
