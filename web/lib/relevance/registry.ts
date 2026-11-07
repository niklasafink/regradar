// Stammdaten eines Instituts aus öffentlichen Registern: Unternehmensdatenbank
// (Gattung und Erlaubnisse), EZB-Liste der beaufsichtigten Institute (SI/LSI,
// Finanzholding) und GLEIF (LEI, Mutterunternehmen). Nur Einzelabfragen auf
// Nutzeraktion, Ergebnisse werden in Redis zwischengespeichert. Server-only.

import https from "node:https";
import ecbJson from "./ecb-entities.json";
import { redis } from "../subscribers";

const INST_BASE = "https://portal.mvp.bafin.de/database/InstInfo/";
const UA = "Mozilla/5.0 (compatible; regradar.de)";
const CACHE_TTL = 60 * 60 * 24 * 14; // 14 Tage

export interface RegistryHit { id: string; name: string; gattung: string }
export interface License { text: string; since: string; ended?: string; reason?: string }
export interface RegistryEntry {
  id: string;
  name: string;
  gattung: string[];
  address: string;
  licenses: License[]; // nur aktive
  endedLicenses: number;
}

const decode = (s: string): string =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/* Der Registerserver sendet einen mehrzeiligen Permissions-Policy-Header,
   den fetch (undici) als Protokollfehler ablehnt; node:https mit tolerantem
   Parser liest die Seite trotzdem. */
function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      insecureHTTPParser: true,
      timeout: 15_000,
    }, (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        reject(new Error(`Register ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Register: Zeitüberschreitung")));
    req.on("error", reject);
  });
}

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis().get<T>(key);
    if (hit) return hit;
  } catch { /* Cache optional */ }
  const val = await fn();
  try { await redis().set(key, val, { ex: CACHE_TTL }); } catch { /* egal */ }
  return val;
}

export function searchRegistry(name: string): Promise<RegistryHit[]> {
  const q = name.trim().slice(0, 100);
  if (q.length < 2) return Promise.resolve([]);
  return cached(`reg:s:${q.toLowerCase()}`, async () => {
    const url = `${INST_BASE}sucheForm.do?${new URLSearchParams({ sucheButtonInstitut: "Suche", institutName: q })}`;
    const html = await fetchText(url);
    const table = html.match(/<table class="displaytag" id="institut">([\s\S]*?)<\/table>/)?.[1] ?? "";
    const out: RegistryHit[] = [];
    for (const row of table.match(/<tr class="(?:odd|even)">[\s\S]*?<\/tr>/g) ?? []) {
      const m = row.match(/institutId=(\d+)">([\s\S]*?)<\/a>/);
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => decode(x[1]));
      if (m) out.push({ id: m[1], name: decode(m[2]), gattung: tds[1] ?? "" });
    }
    return out.slice(0, 25);
  });
}

export function registryDetails(id: string): Promise<RegistryEntry> {
  if (!/^\d{1,10}$/.test(id)) return Promise.reject(new Error("ungültige ID"));
  return cached(`reg:d:${id}`, async () => {
    const html = await fetchText(`${INST_BASE}institutDetails.do?cmd=loadInstitutAction&institutId=${id}`);
    const name = decode(html.match(/<h2>Unternehmen<\/h2>\s*<p>\s*<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "");
    const gattung = decode(html.match(/<dt>Gattung:<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)?.[1] ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const address = decode(html.match(/<\/dl>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const tbody = html.match(/Erlaubnisse\/Zulassung\/T[äa&;\w]*tigkeiten[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const all: License[] = [];
    for (const row of tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
      const c = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => decode(x[1]));
      if (c[0]) all.push({ text: c[0], since: c[1] ?? "", ended: c[2] || undefined, reason: c[3] || undefined });
    }
    return {
      id, name, gattung, address,
      licenses: all.filter((l) => !l.ended),
      endedLicenses: all.filter((l) => l.ended).length,
    };
  });
}

/* EZB-Liste der beaufsichtigten Institute (vom Scraper monatlich nach
   ecb-entities.json exportiert, scraper/regradar/ecblist.py). */
export interface EcbEntity { lei: string; name: string; type: string; si: boolean; hi: boolean; country: string; group?: string }
const ECB = (ecbJson as { entities: EcbEntity[] }).entities ?? [];

const normName = (s: string) =>
  s.toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/\b(ag|gmbh|se|eg|kgaa|s\.a\.|sa|mbh|co|kg|& co\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

export function ecbLookup(name: string, lei?: string): EcbEntity | undefined {
  if (lei) {
    const byLei = ECB.find((e) => e.lei === lei);
    if (byLei) return byLei;
  }
  const n = normName(name);
  return ECB.find((e) => normName(e.name) === n);
}

/* GLEIF: LEI und Mutterunternehmen (frei, ohne Schlüssel). */
export interface GleifInfo {
  lei: string;
  legalName: string;
  country?: string;
  directParent?: { lei: string; name: string; country?: string };
  ultimateParent?: { lei: string; name: string; country?: string };
}

async function gleifJson(path: string): Promise<{ data?: unknown } | null> {
  try {
    const res = await fetch(`https://api.gleif.org/api/v1/${path}`, {
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: unknown };
  } catch {
    return null;
  }
}

type GleifRecord = { id: string; attributes: { entity: { legalName: { name: string }; legalAddress?: { country?: string }; category?: string } } };

export function gleifLookup(name: string): Promise<GleifInfo | null> {
  return cached(`reg:g:${normName(name)}`, async () => {
    const res = await gleifJson(`lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=5`);
    const recs = ((res?.data as GleifRecord[]) ?? []).filter((r) => r.attributes.entity.category !== "BRANCH");
    const rec = recs.find((r) => normName(r.attributes.entity.legalName.name) === normName(name)) ?? recs[0];
    if (!rec) return null;
    const parent = async (rel: string) => {
      const p = await gleifJson(`lei-records/${rec.id}/${rel}`);
      const d = p?.data as GleifRecord | undefined;
      return d?.id
        ? { lei: d.id, name: d.attributes.entity.legalName.name, country: d.attributes.entity.legalAddress?.country }
        : undefined;
    };
    return {
      lei: rec.id,
      legalName: rec.attributes.entity.legalName.name,
      country: rec.attributes.entity.legalAddress?.country,
      directParent: await parent("direct-parent"),
      ultimateParent: await parent("ultimate-parent"),
    };
  });
}

export const EEA = new Set([
  "DE", "AT", "BE", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "IS", "LI", "NO",
]);
