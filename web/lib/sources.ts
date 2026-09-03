// Bindet die vom Scraper angebundenen Quellen (lib/sources.json) an das
// Frontend (Footer + /quellen). Die Datei wird bei jedem Export aus der
// Source-Registry neu geschrieben:
//   cd scraper && python3 -m regradar export-web

import sourcesJson from "./sources.json";

export interface Source {
  id: string;
  name: string;
  authority: string;
  jurisdiction: "EU" | "DE" | "LU" | "INT";
  access: string; // Zugriffsweg: RSS, API, SITEMAP, XML, HTML
  url: string;
}

interface SourcesPayload {
  generated_at: string;
  sources: Source[];
}

const payload = sourcesJson as SourcesPayload;

export const SOURCES: Source[] = payload.sources;

export const SOURCES_GENERATED_AT = payload.generated_at;

/** Anzeige-Reihenfolge der Rechtsräume auf der Quellen-Seite. */
export const JURISDICTIONS: Source["jurisdiction"][] = ["EU", "DE", "LU", "INT"];

export const JURISDICTION_LABEL: Record<
  Source["jurisdiction"],
  { de: string; en: string }
> = {
  EU: { de: "Europäische Union", en: "European Union" },
  DE: { de: "Deutschland", en: "Germany" },
  LU: { de: "Luxemburg", en: "Luxembourg" },
  INT: { de: "International", en: "International" },
};
