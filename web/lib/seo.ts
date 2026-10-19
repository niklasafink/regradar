// Gemeinsame SEO-Bausteine: Seiten-Metadaten (Titel, Beschreibung, Canonical,
// Open Graph, Twitter) und strukturierte Daten (JSON-LD). Längen nach den
// Prüfregeln von squirrelscan: Titel 30–75, Beschreibung 120–160 Zeichen.
// `npm run seo:check` prüft die gebaute Seite dagegen.

import type { Metadata } from "next";
import type { Framework } from "./base";
import { providerSlug } from "./core";

export const SITE_URL = (process.env.APP_URL ?? "https://www.regradar.de").replace(/\/$/, "");
export const SITE_NAME = "Regulatory Radar";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: SITE_NAME };

export const TITLE_MAX = 75;

export const HOME_TITLE = "Regulatory Radar: Regulatorik-Monitoring für Finanzinstitute";
export const HOME_DESCRIPTION =
  "Kostenloser Regulatory Monitor für Banken, Asset Manager, Wertpapier-, Zahlungsinstitute und Versicherer: Updates von BaFin, EBA, ESMA und EU mit Fristen.";
export const DESC_MIN = 120;
export const DESC_MAX = 160;

/** Text an einer Wortgrenze auf höchstens `max` Zeichen kürzen (mit „…“). */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,;:–-]+$/, "");
  return `${cut}…`;
}

/** Beschreibung auf 120–160 Zeichen bringen: zu kurze um `extra` ergänzen,
    zu lange an einer Wortgrenze kürzen. */
export function description(s: string, extra = ""): string {
  let t = s.replace(/\s+/g, " ").trim();
  if (t.length < DESC_MIN && extra) t = `${t.replace(/[.!]?$/, ".")} ${extra}`;
  return clip(t, DESC_MAX);
}

/** Seitentitel mit Markenzusatz, solange er in TITLE_MAX passt. */
export function title(main: string): string {
  const withBrand = `${main} · ${SITE_NAME}`;
  return withBrand.length <= TITLE_MAX ? withBrand : clip(main, TITLE_MAX);
}

/** Titel und Beschreibung der Zielgruppen-Übersicht /r/[provider]. */
export const providerTitle = (short: string) => `Regulatorik für ${short}: Rahmenwerke und Updates`;
export const providerDescription = (n: string, s: string) =>
  description(
    `Alle relevanten Rahmenwerke und regulatorischen Updates für ${n}: ${s}.`,
    "Mit Fristen, Konsultationen und Links zu BaFin, EBA, ESMA und EU-Amtsblatt.",
  );

/** Titel und Beschreibung einer Rahmenwerk-Seite. Kurze Namen („DORA“)
    bekommen einen beschreibenden Zusatz, lange bleiben unverändert. */
export const frameworkTitle = (n: string) =>
  n.length <= 30 ? `${n}: Updates, Fristen und Chronologie` : n;
export const frameworkDescription = (about: string) =>
  description(about, "Alle Updates, Konsultationen und Fristen mit Link zur Primärquelle.");

/** Kanonischer Pfad eines Rahmenwerks: Die Seite ist unter jeder Zielgruppe
    erreichbar, der Inhalt ist gleich. Kanonisch ist die erste Zielgruppe
    (wie der Rücksprung-Link auf den Update-Seiten). */
export const frameworkPath = (f: Pick<Framework, "id" | "ents">): string =>
  `/r/${providerSlug(f.ents[0])}/f/${f.id}`;

/** Metadaten einer Seite inkl. Canonical, Open Graph und Twitter Card.
    `title` wird unverändert gesetzt (der Layout-Titel hat kein Template). */
export function pageMeta(o: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  publishedTime?: string;
  ogTitle?: string;
}): Metadata {
  const ogTitle = o.ogTitle ?? o.title;
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: {
      type: o.type ?? "website",
      url: o.path,
      siteName: SITE_NAME,
      locale: "de_DE",
      title: ogTitle,
      description: o.description,
      images: [OG_IMAGE],
      ...(o.publishedTime ? { publishedTime: o.publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: o.description,
      images: [OG_IMAGE.url],
    },
  };
}

/* ---------- JSON-LD ---------- */

export const organizationLd = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/apple-icon.png`, width: 180, height: 180 },
  parentOrganization: { "@type": "Organization", name: "Conformis", url: "https://www.conformisgrc.com/" },
  sameAs: ["https://github.com/niklasafink/regradar"],
};

export const websiteLd = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  description:
    "Kostenloser Regulatory Monitor für Banken, Asset Manager, Wertpapierinstitute, Zahlungsinstitute und Versicherer in Deutschland und der EU.",
  inLanguage: "de-DE",
  publisher: { "@id": ORG_ID },
};

/** Brotkrumen als BreadcrumbList; erster Eintrag ist immer die Startseite. */
export function breadcrumbLd(items: [name: string, path: string][]) {
  const all: [string, string][] = [["Start", "/"], ...items];
  return {
    "@type": "BreadcrumbList",
    itemListElement: all.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${SITE_URL}${path === "/" ? "/" : path}`,
    })),
  };
}

/** Webseite (oder Sammlung) mit Verweis auf Website und Herausgeber. */
export function webPageLd(o: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "CollectionPage";
}) {
  return {
    "@type": o.type ?? "WebPage",
    "@id": `${SITE_URL}${o.path}#webpage`,
    url: `${SITE_URL}${o.path}`,
    name: o.name,
    description: o.description,
    inLanguage: "de-DE",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
  };
}

/** Mehrere Knoten als ein JSON-LD-Dokument mit @graph. */
export const ldGraph = (...nodes: object[]) =>
  JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
