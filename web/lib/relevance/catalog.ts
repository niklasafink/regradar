// Merkmalskatalog für den Einschlägigkeits-Abgleich. Dieselbe Datei
// (catalog.json) liest der Scraper für die Anforderungsanalyse
// (scraper/regradar/scope.py): Profil und Analyse sprechen dieselbe Sprache.

import catalogJson from "./catalog.json";

export type FeatureGroup = "art" | "erl" | "aufsicht" | "schwelle" | "geschaeft" | "recht";
export interface Feature { id: string; g: FeatureGroup; l: string }

export const CATALOG = catalogJson as {
  version: number;
  groups: { id: FeatureGroup; label: string; closed: boolean }[];
  features: Feature[];
};

export const FEATURES = CATALOG.features;
export const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));
export const featureById = (id: string) => FEATURES.find((f) => f.id === id);
export const featureLabel = (id: string) => featureById(id)?.l ?? id;

/** Gruppen, deren Merkmale bei einem Registerabgleich vollständig bekannt
    sind: Was dort nicht gesetzt ist, trifft nicht zu (geschlossene Welt). */
export const CLOSED_GROUPS = new Set(
  CATALOG.groups.filter((g) => g.closed).map((g) => g.id),
);

/* Erlaubnistexte (Wortlaut wie im Unternehmensregister) → Merkmale.
   Reihenfolge egal, ein Text kann mehrere Merkmale setzen. */
export const LICENSE_RULES: [RegExp, string[]][] = [
  [/^Einlagengesch[äa]ft|Entgegennahme von Einlagen/i, ["lic_einlagen"]],
  [/^Kreditgesch[äa]ft|Ausleihungen/i, ["lic_kredit"]],
  [/Pfandbriefgesch[äa]ft/i, ["lic_pfandbrief"]],
  [/^Diskontgesch[äa]ft/i, ["lic_diskont"]],
  [/^Finanzkommissionsgesch[äa]ft/i, ["lic_finanzkommission"]],
  [/^Depotgesch[äa]ft/i, ["lic_depot"]],
  [/^Garantiegesch[äa]ft|Bürgschaften und Garantien/i, ["lic_garantie"]],
  [/^Emissionsgesch[äa]ft|Teilnahme an Wertpapieremissionen/i, ["lic_emission"]],
  [/E-Geld-Gesch[äa]ft|Ausgabe von E-Geld/i, ["lic_egeld"]],
  [/^Anlagevermittlung/i, ["lic_anlagevermittlung"]],
  [/Anlageberatung/i, ["lic_anlageberatung"]],
  [/^Abschlu(ss|ß)vermittlung/i, ["lic_abschlussvermittlung"]],
  [/Finanzportfolioverwaltung|Portfolioverwaltung|Vermögensverwaltung/i, ["lic_portfolioverwaltung"]],
  [/^Eigenhandel|Handel für eigene Rechnung/i, ["lic_eigenhandel"]],
  [/Market Making/i, ["lic_market_making"]],
  [/Systematische Internalisierung/i, ["lic_si"]],
  [/Hochfrequenz/i, ["lic_hft"]],
  [/Multilateral(es)? Handelssystem|Organisiertes Handelssystem|\bMTF\b|\bOTF\b/i, ["lic_mtf_otf"]],
  [/^Platzierungsgesch[äa]ft/i, ["lic_platzierung"]],
  [/Drittstaateneinlagenvermittlung/i, ["lic_drittstaateneinlagen"]],
  [/^Sortengesch[äa]ft/i, ["lic_sorten"]],
  [/^Factoring/i, ["lic_factoring"]],
  [/Finanzierungsleasing/i, ["lic_leasing"]],
  [/^Anlageverwaltung/i, ["lic_anlageverwaltung"]],
  [/^Eigengesch[äa]ft/i, ["lic_eigengeschaeft"]],
  [/Kryptoverwahr|Verwahrung und Verwaltung von Kryptowerten/i, ["lic_krypto_verwahrung", "lic_krypto_dienste"]],
  [/Kryptowert|MiCA/i, ["lic_krypto_dienste"]],
  [/Zahlungs(vorg[äa]ng|dienst|instrument|auslösedienst)|Finanztransfer|Kontoinformationsdienst|Lastschriftgesch|Zahlungskarten|Akquisitionsgesch/i, ["lic_zahlungsdienste"]],
  [/OGAW/i, ["lic_fonds_ogaw"]],
  [/\bAIF\b|Spezial-AIF|Publikums-AIF|Hedgefonds|Immobilien-Sonderverm|Investmentverm[öo]gen/i, ["lic_fonds_aif"]],
  [/Vertrieb/i, ["lic_fonds_vertrieb"]],
  [/Leben\b|Lebensversicher|Kapitalisierungsgesch|Fondsgebundene|Tontinen|Versorgungseinrichtungen/i, ["lic_vers_leben"]],
  [/Kranken/i, ["lic_vers_kranken"]],
  [/Unfall|Feuer|Haftpflicht|Sach|Kraftfahrzeug|Kredit- und Kautions|Rechtsschutz|Transport|Beistandsleistung|Elementarsch|Luftfahrzeug|Schienenfahrzeug|See-, Binnensee/i, ["lic_vers_schaden"]],
  [/R[üu]ckversicherung/i, ["lic_vers_rueck"]],
];

/* „Gattung“ des Registers → Institutsart. */
export const GATTUNG_RULES: [RegExp, string[]][] = [
  [/CRR-Kreditinstitut/i, ["ki_crr", "ki"]],
  [/^Kreditinstitut/i, ["ki"]],
  [/Bausparkasse/i, ["bausparkasse", "ki"]],
  [/Finanzdienstleistungsinstitut/i, ["fdi"]],
  [/Leasing|Factoring/i, ["leasing_factoring", "fdi"]],
  [/Wertpapierinstitut/i, ["wpi"]],
  [/KVG|Kapitalverwaltungsgesellschaft/i, []], // Art ergibt sich aus den Fondsarten
  [/registrierte/i, ["kvg_registriert"]],
  [/E-Geld-Institut/i, ["egi"]],
  [/Zahlungsinstitut/i, ["zi"]],
  [/Lebensversicherer/i, ["versicherer_leben"]],
  [/Krankenversicherer/i, ["versicherer_kranken"]],
  [/Schaden|Unfallversicherer/i, ["versicherer_schaden"]],
  [/R[üu]ckversicherer/i, ["rueckversicherer"]],
  [/Pensionsfonds/i, ["pensionsfonds"]],
  [/Pensionskasse|Sterbekasse/i, ["pensionskasse"]],
  [/Kryptowerte-?dienstleister|Kryptoverwahrer/i, ["casp"]],
  [/MiCAR Emittent/i, ["krypto_emittent"]],
  [/Finanzholding/i, ["finanzholding"]],
  [/grenz[üu]berschreitender Dienstleister|EWR-/i, ["eu_pass"]],
  [/Zweigstelle|Zweigniederlassung/i, ["zweigstelle_drittstaat"]],
  [/Datenbereitstellung/i, ["datenbereitstellung"]],
];

export function featuresFromGattung(gattung: string[]): string[] {
  const out = new Set<string>();
  for (const g of gattung) for (const [re, ids] of GATTUNG_RULES) if (re.test(g)) ids.forEach((i) => out.add(i));
  return [...out];
}

export function featuresFromLicense(text: string): string[] {
  const out = new Set<string>();
  for (const [re, ids] of LICENSE_RULES) if (re.test(text)) ids.forEach((i) => out.add(i));
  return [...out];
}

/** Ableitungen, die sich aus Art und Erlaubnissen sicher ergeben. */
export function deriveFeatures(set: Set<string>): void {
  const has = (id: string) => set.has(id);
  if (has("lic_fonds_ogaw")) set.add("kvg_ogaw");
  if (has("lic_fonds_aif") && !has("kvg_registriert")) set.add("kvg_aif");
  if (has("lic_krypto_dienste") || has("lic_krypto_verwahrung")) {
    set.add("casp");
    set.add("krypto_aktiv");
  }
  if (has("lic_zahlungsdienste") || has("lic_egeld")) set.add("zahlungskonten");
  // EMIR Art. 2 Nr. 8: Kredit- und Wertpapierinstitute, Versicherer, OGAW/AIF-Verwalter, EbAV.
  if (["ki_crr", "wpi", "kvg_ogaw", "kvg_aif", "versicherer_leben", "versicherer_kranken",
    "versicherer_schaden", "rueckversicherer", "pensionsfonds", "pensionskasse"].some(has)) {
    set.add("finanzielle_gegenpartei");
  }
  // SFDR Art. 2: Portfolioverwalter, KVG, Versicherer mit IBIP, Anlageberater.
  if (["kvg_ogaw", "kvg_aif", "lic_portfolioverwaltung", "lic_anlageberatung",
    "versicherer_leben", "pensionsfonds", "pensionskasse"].some(has)) {
    set.add("sfdr_pflichtig");
  }
}

/** Bilanzsumme (in Mrd. €) → Schwellenmerkmale. */
export function sizeFeatures(bsMrd: number | null | undefined): Record<string, boolean> {
  if (bsMrd == null || !Number.isFinite(bsMrd)) return {};
  return {
    bs_unter_5mrd: bsMrd <= 5,
    bs_ab_15mrd: bsMrd >= 15,
    bs_ab_30mrd: bsMrd >= 30,
  };
}
