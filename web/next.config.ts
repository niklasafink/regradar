import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Zeitstempel des letzten Scraper-Exports als Build-Konstante (TODAY in
// lib/base.ts), damit Client-Bundles live.json nicht laden müssen.
const LIVE_GENERATED_AT: string =
  JSON.parse(readFileSync(path.join(process.cwd(), "lib/live.json"), "utf8")).generated_at ?? "";

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

// Sicherheits-Header für alle Antworten. Die CSP erlaubt Inline-Skripte (Next.js,
// JSON-LD, DataFast-Queue) und die beiden Analyse-Dienste: DataFast immer,
// Google Analytics erst nach Einwilligung (components/cookie-consent.tsx).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://datafa.st https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://datafa.st https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net https://www.google.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_LIVE_GENERATED_AT: LIVE_GENERATED_AT },
  // Dateien, die die LinkedIn-Slides zur Laufzeit lesen (Slides, PDF und Posten unter app/api/linkedin).
  outputFileTracingIncludes: {
    "/api/linkedin/**": ["./assets/fonts/**/*", "./public/authorities/**/*", "./app/icon.svg"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return Object.entries(PROVIDER_SLUGS).flatMap(([id, slug]) => [
      { source: `/r/${id}`, destination: `/r/${slug}`, permanent: true },
      { source: `/r/${id}/:path*`, destination: `/r/${slug}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
