// Institutsarten unter „Weitere Institute“ (Zielgruppe OTH). Jede Art hat eine
// eigene Seite /r/weitere-institute/<slug> mit genau ihren Rahmenwerken.
//
// Zuordnung (Stand 13.11.2026): abgeleitet aus den Adressatenkreisen der
// Rahmenwerk-Analysen (scopes.json, Schlüssel f:<id>) und fachlich bereinigt.
// Kind-Rahmenwerke folgen ihrem Elternteil, außer sie stehen in `drop`.
// Neue Rahmenwerke, die eine dieser Arten betreffen, hier eintragen.

import type { Txt } from "./base";

export interface Subtype {
  id: string;
  slug: string;
  n: Txt;
  /** Plural für Seitentitel und Beschreibung. */
  pl: string;
  /** Gruppe im Auswahldialog. */
  g: "credit" | "markets" | "group";
  /** Eltern-Rahmenwerke (Kinder kommen automatisch mit). */
  fws: string[];
  /** Kinder oder Rahmenwerke, die trotz Elternteil nicht gelten. */
  drop?: string[];
}

export const SUBTYPE_GROUPS: { id: Subtype["g"]; n: Txt }[] = [
  { id: "credit", n: { de: "Kredit und Finanzierung", en: "Credit and financing" } },
  { id: "markets", n: { de: "Kapitalmarkt und Kryptowerte", en: "Capital markets and crypto-assets" } },
  { id: "group", n: { de: "Gruppe", en: "Group" } },
];

/* Querschnittsrecht, das jedes dieser Unternehmen trifft. */
const CROSS = ["sanctions", "dsgvo", "aiact", "hinschg", "csrd", "lksg", "dataact", "cra"];

/* Leasing und Factoring: Finanzdienstleistungsinstitute nach § 1 Abs. 1a
   Satz 2 Nr. 9/10 KWG mit eingeschränktem KWG-Regime. DORA gilt über
   § 1a Abs. 2a KWG entsprechend; TLPT und Bank-Aufsichtsrecht (CRR, SREP,
   Einlagensicherung) entfallen (§ 2 Abs. 7a KWG). §§ 25c/25d KWG gelten,
   daher Fit & Proper. Nicht anwendbar (geprüft 13.11.2026): InstitutsVergV
   (§ 1 Abs. 1 Satz 2), EBA-IKT-Leitlinien (nur CRR-Institute und
   Zahlungsdienstleister), Beschwerde-Rundschreiben 06/2018 (nur CRR-
   Kreditinstitute, ZAG-Institute und KVGen). */
const LEASING_FACTORING = [...CROSS, "kwglf", "dora", "nis2", "amla", "gwg", "marisk", "fitproper"];

/* Bausparkassen und Pfandbriefbanken sind CRR-Kreditinstitute: volles
   Bankaufsichtsrecht, aber ohne Zahlungsverkehr und Wertpapierdienstleistungen. */
const SPECIAL_BANK = [
  ...CROSS, "dora", "ebaict", "amla", "gwg", "crr3", "marisk", "brrd", "dgsd", "ebagov", "srep", "irrbb",
  "ebapog", "ebasalesrem", "instvergv", "outsourcing", "complaints", "fitproper", "itsrep", "anacredit", "iref",
  "crs", "emir", "bmr", "eidas2", "fida", "consumer", "mcd", "taxonomy", "ebaesg", "securitisation", "krzwmg",
  "loanorig",
];

export const SUBTYPES: Subtype[] = [
  { id: "leasing", pl: "Leasinggesellschaften", slug: "leasing", g: "credit",
    n: { de: "Leasinggesellschaft", en: "Leasing company" },
    // Finanzierungsleasing an Verbraucher ist entgeltliche Finanzierungshilfe (§ 506 BGB).
    fws: [...LEASING_FACTORING, "consumer"],
    drop: ["doratlpt", "ebaamlstd"] },
  { id: "factoring", pl: "Factoringinstitute", slug: "factoring", g: "credit",
    n: { de: "Factoringinstitut", en: "Factoring institution" },
    fws: LEASING_FACTORING,
    drop: ["doratlpt", "ebaamlstd"] },
  { id: "bausparkasse", pl: "Bausparkassen", slug: "bausparkasse", g: "credit",
    n: { de: "Bausparkasse", en: "Building and loan association" },
    fws: [...SPECIAL_BANK, "bspkg"] },
  { id: "pfandbriefbank", pl: "Pfandbriefbanken", slug: "pfandbriefbank", g: "credit",
    n: { de: "Pfandbriefbank", en: "Pfandbrief bank" },
    // Emittiert börsennotierte Pfandbriefe und refinanziert sich über Repos.
    fws: [...SPECIAL_BANK, "pfandbg", "mar", "prospectus", "sftr"] },
  { id: "foerderbank", pl: "Förderbanken", slug: "foerderbank", g: "credit",
    n: { de: "Förderbank", en: "Promotional bank" },
    // Von der CRD ausgenommen; die CRR gilt über § 1a KWG entsprechend.
    // Kein Einlagen- und kein Retailgeschäft (Hausbankprinzip).
    fws: [...CROSS, "dora", "nis2", "ebaict", "amla", "gwg", "crr3", "marisk", "ebagov", "srep", "irrbb",
      "instvergv", "outsourcing", "fitproper", "itsrep", "anacredit", "loanorig"] },
  { id: "casp", pl: "Kryptowerte-Dienstleister", slug: "kryptowerte-dienstleister", g: "markets",
    n: { de: "Kryptowerte-Dienstleister", en: "Crypto-asset service provider" },
    fws: [...CROSS, "dora", "amla", "gwg", "tfr", "mica", "crs", "misp"],
    drop: ["ebamicaart"] },
  { id: "token", pl: "Token-Emittenten (EMT, ART)", slug: "token-emittent", g: "markets",
    n: { de: "Token-Emittent (EMT, ART)", en: "Token issuer (EMT, ART)" },
    // ART-Emittenten sind nach § 2 Abs. 1 Nr. 2 GwG Verpflichtete.
    fws: [...CROSS, "dora", "amla", "gwg", "mica"] },
  { id: "venue", pl: "Handelsplatzbetreiber", slug: "handelsplatz", g: "markets",
    n: { de: "Handelsplatzbetreiber", en: "Trading venue operator" },
    fws: [...CROSS, "boersg", "dora", "mifid", "mar", "csdr", "dltpilot", "misp"] },
  { id: "holding", pl: "Finanzholdings", slug: "finanzholding", g: "group",
    n: { de: "Finanzholding", en: "Financial holding company" },
    // Pflichten auf konsolidierter Ebene; gemischte Finanzholdings zusätzlich FICOD.
    // Als Finanzunternehmen geldwäscherechtlich verpflichtet (§ 2 Abs. 1 Nr. 6 GwG),
    // als übergeordnetes Unternehmen gruppenweites Risikomanagement (§ 25a Abs. 3 KWG).
    fws: [...CROSS, "gwg", "amla", "marisk", "crr3", "ficod", "brrd", "ebagov", "srep", "irrbb", "instvergv", "itsrep", "fitproper",
      "ebaesg", "securitisation", "loanorig"] },
];

/** Gehört das Rahmenwerk zu „Weitere Institute“ insgesamt? Ohne gewählte
    Institutsart gilt die Vereinigung: OTH-Rahmenwerke plus alle Arten. */
export const othIncludes = (f: { id: string; parent?: string; ents: string[] }): boolean =>
  f.ents.includes("OTH") || SUBTYPES.some((s) => subtypeIncludes(s, f));

export const subtypeBySlug = (slug: string) => SUBTYPES.find((s) => s.slug === slug || s.id === slug);

/** Gilt das Rahmenwerk für die Institutsart? Kinder folgen ihrem Elternteil. */
export const subtypeIncludes = (s: Subtype, f: { id: string; parent?: string }): boolean =>
  !s.drop?.includes(f.id) && (s.fws.includes(f.id) || (!!f.parent && s.fws.includes(f.parent)));
