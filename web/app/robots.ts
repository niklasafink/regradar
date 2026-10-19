import type { MetadataRoute } from "next";

const BASE = process.env.APP_URL ?? "http://localhost:3001";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
