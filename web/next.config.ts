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
  async redirects() {
    return Object.entries(PROVIDER_SLUGS).flatMap(([id, slug]) => [
      { source: `/r/${id}`, destination: `/r/${slug}`, permanent: true },
      { source: `/r/${id}/:path*`, destination: `/r/${slug}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
