import type { NextConfig } from "next";

// Alte Zielgruppen-URLs mit internen IDs (/r/CI) dauerhaft auf die
// sprechenden Slugs (/r/bank) umleiten; Slugs siehe PROVIDERS in lib/data.ts.
const PROVIDER_SLUGS: Record<string, string> = {
  CI: "bank",
  AM: "asset-manager",
  IF: "wertpapierinstitut",
  PI: "zahlungsinstitut",
  INS: "versicherung",
  OTH: "sonstige",
};

const nextConfig: NextConfig = {
  // Dateien, die die LinkedIn-Slides zur Laufzeit lesen (Slides, PDF und Posten unter app/api/linkedin).
  outputFileTracingIncludes: {
    "/api/linkedin/**": ["./assets/fonts/**/*", "./public/authorities/**/*", "./app/icon.svg"],
  },
  async redirects() {
    return Object.entries(PROVIDER_SLUGS).flatMap(([id, slug]) => [
      { source: `/r/${id}`, destination: `/r/${slug}`, permanent: true },
      { source: `/r/${id}/:path*`, destination: `/r/${slug}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
