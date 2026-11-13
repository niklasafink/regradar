// Stammdaten eines Instituts aus öffentlichen Registern: Unternehmensdatenbank
// (Gattung und Erlaubnisse), EZB-Liste der beaufsichtigten Institute (SI/LSI,
// Finanzholding) und GLEIF (LEI, Mutterunternehmen). Nur Einzelabfragen auf
// Nutzeraktion, Ergebnisse werden in Redis zwischengespeichert. Server-only.

import https from "node:https";
import ecbJson from "./ecb-entities.json";
import eiopaJson from "./eiopa-insurers.json";
import { redis } from "../subscribers";
import { displayName } from "./names";

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
      if (m) out.push({ id: m[1], name: displayName(decode(m[2])), gattung: tds[1] ?? "" });
    }
    return out.slice(0, 25);
  });
}

/* Das Register sucht nur nach wörtlichen Teilstrings: „Commerzbank AG“,
   „Sparda Bank Baden-Württemberg“ und „Signal Iduna Gruppe“ liefern nichts
   (Befund aus dem Nutzungsprotokoll vom 11.11.2026). Ohne Treffer probiert
   die Suche deshalb Varianten: ohne Rechtsform und „Gruppe“, mit Bindestrich
   statt Leerzeichen, zuletzt nur das erste Wort. */
const LEGAL_FORM = /\s+(ag|se|eg|e\.\s?g\.|gmbh|mbh|kgaa|kg|a\.\s?g\.|vvag|aktiengesellschaft|gruppe|group|konzern|holding)\.?$/i;

export function searchVariants(name: string): string[] {
  const q = name.trim().replace(/\s+/g, " ");
  let stripped = q;
  while (LEGAL_FORM.test(stripped)) stripped = stripped.replace(LEGAL_FORM, "").trim();
  const first = stripped.split(" ")[0];
  const out = [q, stripped, stripped.replace(" ", "-"), stripped.replace(/-/g, " "), first.length >= 4 ? first : ""];
  return [...new Set(out.filter((v) => v.length >= 3))];
}

export async function searchRegistryFuzzy(name: string): Promise<RegistryHit[]> {
  for (const v of searchVariants(name).slice(0, 5)) {
    const hits = await searchRegistry(v);
    if (hits.length) return hits;
  }
  return [];
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

export const ecbByLei = (lei: string): EcbEntity | undefined => ECB.find((e) => e.lei === lei);

const COUNTRY: Record<string, string> = {
  AT: "Österreich", LU: "Luxemburg", FR: "Frankreich", IT: "Italien", ES: "Spanien", NL: "Niederlande",
  BE: "Belgien", IE: "Irland", PT: "Portugal", FI: "Finnland", GR: "Griechenland", SK: "Slowakei",
  SI: "Slowenien", EE: "Estland", LV: "Lettland", LT: "Litauen", MT: "Malta", CY: "Zypern", HR: "Kroatien",
  BG: "Bulgarien",
};
const regionNames = new Intl.DisplayNames(["de"], { type: "region" });
export const countryName = (c: string) => COUNTRY[c] ?? regionNames.of(c) ?? c;

/* Versicherer des EWR außerhalb Deutschlands aus dem EIOPA-Register (Export
   vom 11.11.2026, Abrufskript scraper/eiopa_fetch.py). Das Register
   nennt Name, Sitzstaat, LEI und ob das Unternehmen in Deutschland über eine
   Niederlassung oder im Dienstleistungsverkehr gemeldet ist (`de`), aber
   keine Sparte: die fragt der Profil-Ablauf ab. Treffer-ID: "eiopa:<Staat>:<Nr>". */
export interface EiopaEntity { id: string; lei: string | null; name: string; country: string; city: string | null; de?: boolean }
const EIOPA = (eiopaJson as { entities: EiopaEntity[] }).entities ?? [];
export const eiopaById = (key: string): EiopaEntity | undefined => {
  const [country, id] = key.split(":");
  return EIOPA.find((e) => e.country === country && e.id === id);
};

export function searchEiopa(name: string): RegistryHit[] {
  for (const v of searchVariants(name)) {
    const n = normName(v);
    if (n.length < 3) continue;
    const out = EIOPA.filter((e) => normName(e.name).includes(n)).slice(0, 10)
      .map((e) => ({ id: `eiopa:${e.country}:${e.id}`, name: displayName(e.name), gattung: `Versicherungsunternehmen, Sitz ${countryName(e.country)}` }));
    if (out.length) return out;
  }
  return [];
}

/** Banken und Finanzholdings des Euroraums außerhalb Deutschlands (für sie
    gibt es keinen Eintrag im deutschen Register). Treffer-ID: "ecb:<LEI>". */
export function searchEcb(name: string): RegistryHit[] {
  const out: RegistryHit[] = [];
  for (const v of searchVariants(name)) {
    const n = normName(v);
    if (n.length < 3) continue;
    for (const e of ECB) {
      if (e.country === "DE" || !normName(e.name).includes(n)) continue;
      const holding = e.type === "FH" || e.type === "MFH";
      out.push({ id: `ecb:${e.lei}`, name: displayName(e.name), gattung: `${holding ? "Finanzholding" : "CRR-Kreditinstitut"}, Sitz ${countryName(e.country)}` });
      if (out.length >= 10) return out;
    }
    if (out.length) return out;
  }
  return out;
}

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
