// Institutsprofil: Erlaubnisse 1:1 aus dem Unternehmensregister, Aufsichts-
// status aus der EZB-Liste, Gruppe aus GLEIF, Größe und Geschäftsmerkmale
// aus einer Kurzrecherche (nur Vorschlag, der Nutzer bestätigt). Alles wird
// auf den Merkmalskatalog (catalog.json) abgebildet. Server-only.

import { createHash, randomUUID } from "node:crypto";
import {
  CLOSED_GROUPS, FEATURES, FEATURE_IDS, deriveFeatures, featureById,
  featuresFromGattung, featuresFromLicense, sizeFeatures,
} from "./catalog";
import { chatJson, MODELS } from "./llm";
import {
  EEA, ecbLookup, gleifLookup, registryDetails, searchRegistry,
  type EcbEntity, type GleifInfo, type License,
} from "./registry";

export type FactSource = "register" | "ezb" | "gleif" | "recherche" | "nutzer" | "abgeleitet";

export interface Profile {
  id: string;
  name: string;
  registryId?: string;
  lei?: string;
  gattung: string[];
  address?: string;
  licenses: License[];
  /** Explizit bekannte Merkmale (true/false). Fehlende = unbekannt, außer
      in geschlossenen Gruppen (Art, Erlaubnisse) bei closed=true. */
  facts: Record<string, boolean>;
  sources: Record<string, FactSource>;
  /** Belege der Recherche je Merkmal (kurz, mit Quelle). */
  evidence?: Record<string, string>;
  bilanzsumme?: { mrd: number; jahr?: string; quelle?: string };
  ecb?: Pick<EcbEntity, "type" | "si" | "hi" | "group">;
  group?: { parent?: string; ultimate?: string; ultimateCountry?: string };
  website?: string;
  /** Art und Erlaubnisse vollständig bekannt (Register oder Nutzerangabe). */
  closed: boolean;
  /** Herkunft: Register-Treffer, manuell, oder automatisch aus der Mail-Domain. */
  origin: "register" | "manuell" | "domain";
  createdAt: string;
  updatedAt: string;
}

export type Tri = true | false | null;

export function featureValue(p: Pick<Profile, "facts" | "closed">, id: string): Tri {
  if (id in p.facts) return p.facts[id];
  const f = featureById(id);
  if (p.closed && f && CLOSED_GROUPS.has(f.g)) return false;
  return null;
}

/** Kompakte Signatur über alle Merkmalswerte: Profile mit gleichen Merkmalen
    (z. B. alle Abonnenten derselben Domain) teilen sich Abgleichsergebnisse. */
export function profileSignature(p: Profile): string {
  const parts = FEATURES.map((f) => {
    const v = featureValue(p, f.id);
    return v === null ? "" : `${f.id}=${v ? 1 : 0}`;
  }).filter(Boolean);
  parts.push(`lic=${p.licenses.map((l) => l.text).sort().join("|")}`);
  return createHash("sha256").update(parts.join(";")).digest("base64url").slice(0, 22);
}

const now = () => new Date().toISOString();

function setFact(p: Profile, id: string, v: boolean, src: FactSource, overwrite = false) {
  if (!FEATURE_IDS.has(id)) return;
  if (!overwrite && id in p.facts && p.sources[id] !== "recherche") return;
  p.facts[id] = v;
  p.sources[id] = src;
}

export function emptyProfile(name: string, origin: Profile["origin"]): Profile {
  return {
    id: randomUUID(), name, gattung: [], licenses: [], facts: {}, sources: {},
    closed: false, origin, createdAt: now(), updatedAt: now(),
  };
}

/** Register, EZB und GLEIF zusammenführen. */
export async function profileFromRegistry(registryId: string, origin: Profile["origin"] = "register"): Promise<Profile> {
  const reg = await registryDetails(registryId);
  const p = emptyProfile(reg.name, origin);
  p.registryId = reg.id;
  p.gattung = reg.gattung;
  p.address = reg.address;
  p.licenses = reg.licenses;
  p.closed = true;

  for (const id of featuresFromGattung(reg.gattung)) setFact(p, id, true, "register");
  for (const l of reg.licenses) for (const id of featuresFromLicense(l.text)) setFact(p, id, true, "register");

  const de = /Deutschland\s*$/.test(reg.address);
  if (de) {
    setFact(p, "sitz_de", true, "register");
    setFact(p, "taetig_de", true, "register");
  } else if (reg.address) {
    setFact(p, "sitz_de", false, "register");
    setFact(p, "taetig_de", true, "register");
    if (/Luxemburg|Luxembourg/i.test(reg.address)) setFact(p, "sitz_lu", true, "register");
    else setFact(p, "sitz_eu", true, "register");
  }

  const gleif: GleifInfo | null = await gleifLookup(reg.name).catch(() => null);
  if (gleif) {
    p.lei = gleif.lei;
    p.group = {
      parent: gleif.directParent?.name,
      ultimate: gleif.ultimateParent?.name,
      ultimateCountry: gleif.ultimateParent?.country,
    };
    if (gleif.directParent) setFact(p, "gruppe_nachgeordnet", true, "gleif");
    const uc = gleif.ultimateParent?.country;
    if (uc) setFact(p, "drittstaatengruppe", !EEA.has(uc), "gleif");
  }

  const ecb = ecbLookup(reg.name, p.lei);
  if (ecb) {
    p.ecb = { type: ecb.type, si: ecb.si, hi: ecb.hi, group: ecb.group };
    setFact(p, "si", ecb.si, "ezb");
    setFact(p, "lsi", !ecb.si, "ezb");
    setFact(p, "lsi_hi", ecb.hi, "ezb");
    if (ecb.si) {
      setFact(p, "snci", false, "abgeleitet");
      setFact(p, "bedeutend_ivv", true, "abgeleitet");
    }
    if (ecb.type === "FH" || ecb.type === "MFH") {
      setFact(p, "finanzholding", true, "ezb");
      setFact(p, "gruppe_uebergeordnet", true, "ezb");
    }
  } else if (p.facts.ki_crr) {
    // CRR-Kreditinstitute im Euroraum stehen auf der Liste; fehlt der
    // Eintrag, ist der Status unklar (Namensabweichung) → offen lassen.
  } else {
    setFact(p, "si", false, "abgeleitet");
  }

  applyDerived(p);
  return p;
}

export function applyDerived(p: Profile): void {
  const trueSet = new Set(Object.entries(p.facts).filter(([, v]) => v).map(([k]) => k));
  const before = new Set(trueSet);
  deriveFeatures(trueSet);
  for (const id of trueSet) if (!before.has(id) && !(id in p.facts)) setFact(p, id, true, "abgeleitet");
  if (p.bilanzsumme) {
    for (const [id, v] of Object.entries(sizeFeatures(p.bilanzsumme.mrd))) {
      if (p.sources[id] !== "nutzer") setFact(p, id, v, "recherche", true);
    }
    if (p.facts.ki_crr && p.sources.bedeutend_ivv !== "nutzer" && p.sources.bedeutend_ivv !== "abgeleitet") {
      setFact(p, "bedeutend_ivv", p.bilanzsumme.mrd >= 15, "recherche", true);
    }
    if (p.facts.ki_crr && p.sources.snci !== "nutzer" && p.sources.snci !== "abgeleitet" && p.bilanzsumme.mrd > 5) {
      setFact(p, "snci", false, "recherche", true);
    }
  }
  p.updatedAt = now();
}

/* Rückfragen: offene Merkmale, die je Institutsart über die Einschlägigkeit
   entscheiden. Die Recherche füllt sie vor, der Nutzer bestätigt. */
const Q_BANK = [
  "snci", "bedeutend_ivv", "osii", "irb", "handelsbuch_klein", "gruppe_uebergeordnet",
  "kapitalmarktorientiert", "csrd_pflichtig", "privatkunden", "verbraucherkredit",
  "wohnimmobilienkredit", "gewerbeimmobilienkredit", "immo_ausland", "otc_derivate",
  "verbriefung_originator", "verbriefung_investor", "kartengeschaeft", "krypto_aktiv",
  "auslagerung_wesentlich", "ki_systeme",
];
const Q_WPI = ["wpi_gross", "wpi_mittel", "wpi_klein", "privatkunden", "otc_derivate", "krypto_aktiv",
  "kapitalmarktorientiert", "auslagerung_wesentlich"];
const Q_KVG = ["geldmarktfonds", "eltif", "privatkunden", "otc_derivate", "verbriefung_investor",
  "kapitalmarktorientiert", "csrd_pflichtig", "auslagerung_wesentlich", "sitz_lu"];
const Q_INS = ["gruppe_uebergeordnet", "kapitalmarktorientiert", "csrd_pflichtig", "otc_derivate",
  "verbriefung_investor", "versicherungsvertrieb", "auslagerung_wesentlich", "ki_systeme"];
const Q_PAY = ["privatkunden", "kartengeschaeft", "krypto_aktiv", "auslagerung_wesentlich", "kapitalmarktorientiert"];
const Q_LEASING = ["gruppe_uebergeordnet", "kapitalmarktorientiert", "csrd_pflichtig", "privatkunden",
  "verbriefung_originator", "otc_derivate", "auslagerung_wesentlich"];
const Q_DEFAULT = ["gruppe_uebergeordnet", "kapitalmarktorientiert", "csrd_pflichtig", "privatkunden",
  "otc_derivate", "auslagerung_wesentlich"];

export function questionIds(p: Profile): string[] {
  const f = (id: string) => p.facts[id] === true;
  let ids: string[];
  if (f("ki")) ids = Q_BANK;
  else if (f("wpi")) ids = Q_WPI;
  else if (f("kvg_ogaw") || f("kvg_aif") || f("kvg_registriert")) ids = Q_KVG;
  else if (["versicherer_leben", "versicherer_kranken", "versicherer_schaden", "rueckversicherer",
    "pensionsfonds", "pensionskasse"].some(f)) ids = Q_INS;
  else if (f("zi") || f("egi")) ids = Q_PAY;
  else if (f("leasing_factoring")) ids = Q_LEASING;
  else ids = Q_DEFAULT;
  // Merkmale aus Registern stehen fest und werden nicht erfragt.
  return ids.filter((id) => !["register", "ezb", "abgeleitet"].includes(p.sources[id] ?? ""));
}

export interface Question {
  id: string; label: string; value: Tri; source: FactSource | null; evidence: string | null;
}

export function questionsFor(p: Profile): Question[] {
  return questionIds(p).map((id) => ({
    id,
    label: featureById(id)?.l ?? id,
    value: featureValue(p, id),
    source: p.sources[id] ?? null,
    evidence: p.evidence?.[id] ?? null,
  }));
}

/* Kurzrecherche im Netz (OpenRouter-Websuche): Bilanzsumme und Vorschläge
   für die offenen Merkmale, jeweils mit Beleg. Ergebnis ist ein Vorschlag. */
interface ResearchOut {
  website?: string | null;
  bilanzsumme_mrd?: number | null;
  bilanzsumme_jahr?: string | null;
  bilanzsumme_quelle?: string | null;
  merkmale?: Record<string, { wert: boolean | null; beleg?: string }>;
}

export async function research(p: Profile): Promise<number> {
  const qs = questionIds(p);
  const system = `Du recherchierst Fakten über ein beaufsichtigtes Finanzunternehmen für einen Compliance-Abgleich.
Nutze die Websuche (Geschäftsbericht, Offenlegungsbericht nach Säule 3, SFCR-Bericht, Website des Unternehmens).
Antworte ausschließlich als JSON:
{"website": "domain.de" | null,
 "bilanzsumme_mrd": Zahl in Mrd. Euro (Einzelinstitut, letzter Jahresabschluss) | null,
 "bilanzsumme_jahr": "2025" | null,
 "bilanzsumme_quelle": "URL" | null,
 "merkmale": { "<merkmal_id>": {"wert": true | false | null, "beleg": "kurzer Beleg mit Quelle"} } }
Regeln: Nur Werte angeben, die du belegen kannst; sonst null. Keine Vermutungen. Bilanzsumme nur für genau dieses
Rechtssubjekt, nicht für den Konzern oder Verbund.`;
  const user = JSON.stringify({
    unternehmen: p.name,
    anschrift: p.address,
    gattung: p.gattung,
    erlaubnisse: p.licenses.map((l) => l.text),
    gruppe: p.group,
    merkmale_gesucht: qs.map((id) => ({ id, bedeutung: featureById(id)?.l })),
  });
  const { data, costUsd } = await chatJson<ResearchOut>({
    model: MODELS.research, system, user, maxTokens: 1800, web: true,
  });
  if (data.website) p.website = String(data.website).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const bs = Number(data.bilanzsumme_mrd);
  if (Number.isFinite(bs) && bs > 0 && bs < 5000) {
    p.bilanzsumme = {
      mrd: Math.round(bs * 100) / 100,
      jahr: data.bilanzsumme_jahr ?? undefined,
      quelle: data.bilanzsumme_quelle ?? undefined,
    };
  }
  p.evidence = p.evidence ?? {};
  for (const [id, v] of Object.entries(data.merkmale ?? {})) {
    if (!qs.includes(id) || typeof v?.wert !== "boolean") continue;
    if (p.sources[id] === "nutzer") continue;
    setFact(p, id, v.wert, "recherche", true);
    if (v.beleg) p.evidence[id] = String(v.beleg).slice(0, 300);
  }
  applyDerived(p);
  return costUsd;
}

/** Profil-Entwurf: Registerdaten plus optionale Kurzrecherche. */
export async function draftProfile(registryId: string, withResearch = true): Promise<{ profile: Profile; questions: string[]; costUsd: number }> {
  const p = await profileFromRegistry(registryId);
  let costUsd = 0;
  if (withResearch) {
    try { costUsd = await research(p); } catch (e) { console.error("research failed:", e); }
  }
  return { profile: p, questions: questionIds(p), costUsd };
}

/** Manuelles Profil (kein Registereintrag, z. B. LU oder Berater-Mandant). */
export function manualProfile(name: string, facts: Record<string, boolean>): Profile {
  const p = emptyProfile(name, "manuell");
  for (const [id, v] of Object.entries(facts)) setFact(p, id, v, "nutzer", true);
  p.closed = Object.keys(facts).some((id) => featureById(id)?.g === "art");
  applyDerived(p);
  return p;
}

/** Nutzerantworten übernehmen (überschreibt Recherche-Vorschläge). */
export function applyAnswers(
  p: Profile,
  answers: Record<string, boolean | null>,
  bilanzsumme?: number | null,
): Profile {
  for (const [id, v] of Object.entries(answers)) {
    if (!FEATURE_IDS.has(id)) continue;
    if (["register", "ezb"].includes(p.sources[id] ?? "")) continue;
    if (v === null) {
      delete p.facts[id];
      delete p.sources[id];
    } else {
      setFact(p, id, v, "nutzer", true);
    }
  }
  if (bilanzsumme != null && Number.isFinite(bilanzsumme) && bilanzsumme > 0) {
    p.bilanzsumme = { ...(p.bilanzsumme ?? {}), mrd: bilanzsumme, quelle: p.bilanzsumme?.quelle };
    for (const [id, v] of Object.entries(sizeFeatures(bilanzsumme))) setFact(p, id, v, "nutzer", true);
  }
  applyDerived(p);
  return p;
}

/** Eingaben aus dem Client prüfen: nur bekannte Merkmale, Längen begrenzt. */
export function sanitizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Profile>;
  if (typeof r.name !== "string" || !r.facts || typeof r.facts !== "object") return null;
  const facts: Record<string, boolean> = {};
  const sources: Record<string, FactSource> = {};
  for (const [k, v] of Object.entries(r.facts)) {
    if (FEATURE_IDS.has(k) && typeof v === "boolean") {
      facts[k] = v;
      sources[k] = (r.sources?.[k] as FactSource) ?? "nutzer";
    }
  }
  const licenses = Array.isArray(r.licenses)
    ? r.licenses.slice(0, 80).filter((l) => l && typeof l.text === "string")
      .map((l) => ({ text: l.text.slice(0, 200), since: String(l.since ?? "").slice(0, 12) }))
    : [];
  const bs = Number(r.bilanzsumme?.mrd);
  return {
    id: typeof r.id === "string" ? r.id.slice(0, 64) : randomUUID(),
    name: r.name.slice(0, 160),
    registryId: typeof r.registryId === "string" ? r.registryId.slice(0, 12) : undefined,
    lei: typeof r.lei === "string" ? r.lei.slice(0, 20) : undefined,
    gattung: Array.isArray(r.gattung) ? r.gattung.slice(0, 10).map((g) => String(g).slice(0, 120)) : [],
    address: typeof r.address === "string" ? r.address.slice(0, 200) : undefined,
    licenses,
    facts,
    sources,
    evidence: undefined,
    bilanzsumme: Number.isFinite(bs) && bs > 0 ? { mrd: bs, jahr: r.bilanzsumme?.jahr, quelle: r.bilanzsumme?.quelle } : undefined,
    ecb: r.ecb,
    group: r.group,
    website: typeof r.website === "string" ? r.website.slice(0, 100) : undefined,
    closed: !!r.closed,
    origin: r.origin === "domain" || r.origin === "manuell" ? r.origin : "register",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : now(),
    updatedAt: now(),
  };
}

/* Vorprofil aus der Mail-Domain eines Newsletter-Abonnenten. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "web.de", "hotmail.com", "hotmail.de",
  "outlook.com", "outlook.de", "live.de", "live.com", "yahoo.com", "yahoo.de", "t-online.de",
  "icloud.com", "me.com", "mail.de", "posteo.de", "freenet.de", "aol.com", "aol.de", "protonmail.com",
  "proton.me", "mailbox.org", "arcor.de", "online.de", "kabelmail.de",
]);
const ADVISORY = [
  "pwc.com", "pwc.de", "kpmg.com", "kpmg.de", "ey.com", "de.ey.com", "deloitte.com", "deloitte.de",
  "bdo.de", "rsm.de", "mazars.de", "forvismazars.com", "grantthornton.de", "ebnerstolz.de",
  "roedl.com", "roedl.de", "bakertilly.de", "pkf.de", "accenture.com", "capgemini.com",
  "msg-advisors.com", "msg.group", "zeb.de", "zeb.eu", "mck.com", "mckinsey.com", "bcg.com",
  "oliverwyman.com", "rolandberger.com", "hengeler.com", "gleisslutz.com", "freshfields.com",
  "cliffordchance.com", "linklaters.com", "hoganlovells.com", "noerr.com", "cms-hs.com", "cms.law",
];

export type DomainKind = "freemail" | "berater" | "institut" | "unbekannt";

export function classifyDomain(domain: string): DomainKind {
  const d = domain.toLowerCase();
  if (FREEMAIL.has(d)) return "freemail";
  if (ADVISORY.some((a) => d === a || d.endsWith(`.${a}`))) return "berater";
  return "unbekannt";
}

export interface DomainProfile {
  domain: string;
  kind: DomainKind;
  profile?: Profile;
  confidence?: number;
  checkedAt: string;
}

/** Domain → Rechtsträger (Recherche) → Registertreffer → Profil. */
export async function profileFromDomain(domain: string): Promise<DomainProfile> {
  const base: DomainProfile = { domain, kind: classifyDomain(domain), checkedAt: now() };
  if (base.kind !== "unbekannt") return base;
  const { data } = await chatJson<{ finanzunternehmen: boolean; kandidaten: string[]; konfidenz: number }>({
    model: MODELS.research,
    web: true,
    maxTokens: 600,
    system: `Ermittle, welches deutsche oder europäische beaufsichtigte Finanzunternehmen (Bank, Sparkasse, Versicherer,
Kapitalverwaltungsgesellschaft, Zahlungsinstitut, Leasing, Wertpapierinstitut …) die E-Mail-Domain nutzt.
Antworte als JSON: {"finanzunternehmen": true|false, "kandidaten": ["exakter Firmenname laut Impressum", ...], "konfidenz": 0..1}.
Kandidaten: höchstens 3, das beaufsichtigte Rechtssubjekt (nicht die Holding) zuerst. Keine Vermutungen.`,
    user: `Domain: ${domain}`,
  });
  if (!data.finanzunternehmen || !data.kandidaten?.length) return { ...base, kind: "unbekannt", confidence: data.konfidenz };
  for (const name of data.kandidaten.slice(0, 3)) {
    const hits = await searchRegistry(name).catch(() => []);
    if (!hits.length) continue;
    const exact = hits.find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? (hits.length === 1 ? hits[0] : undefined);
    if (!exact) continue;
    const profile = await profileFromRegistry(exact.id, "domain");
    profile.website = domain;
    return { ...base, kind: "institut", profile, confidence: data.konfidenz };
  }
  return { ...base, kind: "unbekannt", confidence: data.konfidenz };
}
