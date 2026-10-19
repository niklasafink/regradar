// Leichte Stammdaten ohne Rahmenwerk-Chronologien: Typen, Zielgruppen,
// Themengebiete und das Referenzdatum. Client-Komponenten wie Kopf- und
// Fußzeile importieren von hier, damit data.ts und live.json (rund 1 MB)
// nicht in jedes Seiten-Bundle wandern. data.ts exportiert alles erneut.

export type Lang = "de" | "en";
export type Txt = { de: string; en: string };

export interface Provider { id: string; slug: string; n: Txt; s: Txt; tags: string[] }
export interface Topic { id: string; n: Txt; d: Txt }
export interface Cond { k: string; any: string[] }
/** Fachbeitrag einer Beratungsgesellschaft (Big 4 u. a.) zu einem Update. */
export interface Advisory { f: string; ti: string; url: string; d?: string }
export interface Update {
  d: string; t: Txt; src: string; ti: Txt; s: Txt;
  /** Slug-Komponente aus dem Original-Titel der Quelle (Scraper-Export).
      Hält URLs stabil, auch wenn `ti` ein beschreibender LLM-Titel ist. */
  sl?: string;
  refnum?: string; deadline?: string; eff?: string;
  /** Link zur Primärquelle. Gesetzt bei echten, gescrapten Updates. */
  url?: string;
  /** LLM-Impact-Urteil nach scraper/IMPACT.md; fehlt es, greift die
      Dokumenttyp-Heuristik in logic.ts. */
  imp?: "high" | "medium" | "low";
  /** Big-4-Fachbeiträge, die genau diese Meldung kommentieren (Scraper). */
  adv?: Advisory[];
}
export interface Framework {
  /** Rechtsraum; "LU" = luxemburgisches Fonds-/CSSF-Recht (nur sichtbar,
      wenn im Onboarding „Luxemburg" gewählt ist). */
  id: string; topic: string; ents: string[]; jur: "EU" | "DE" | "EU+DE" | "LU";
  n: Txt; ref: string;
  /** Umgangssprachliche Bezeichnungen und Abkürzungen (nur für die Suche). */
  alias?: string;
  /** Link zur Primärquelle des Rechtsakts (z. B. EUR-Lex). */
  refUrl?: string;
  /** Übergeordnetes Rahmenwerk: Vorgaben, die einen Hauptstandard konkretisieren
      (EBA-Leitlinien zur CRR, RTS/ITS zu DORA, Durchführungsakte zur AML-VO …),
      sind eigene Rahmenwerke mit eigener Chronologie, erscheinen in der
      Übersicht aber nur als Chip unter der Elternkachel und erben dessen Abo. */
  parent?: string;
  /** Kurzname für Chips unter der Elternkachel (nur bei `parent`). */
  sn?: Txt;
  about: Txt; cond: Cond | null; condL?: Txt; u: Update[];
}
export interface Option { v: string; l: Txt }
export interface Question { key: string; multi: boolean; q: Txt; why: Txt; o: Option[] }

// "Heute" wird aus dem Zeitstempel des letzten Scraper-Exports abgeleitet:
// deterministisch für Server- und Client-Rendering, aktualisiert sich mit
// jedem täglichen Deploy. next.config.ts liest ihn aus live.json und setzt
// ihn als Build-Konstante, damit Client-Code live.json nicht laden muss.
const [gy, gm, gd] = (process.env.NEXT_PUBLIC_LIVE_GENERATED_AT || "2026-08-24")
  .slice(0, 10).split("-").map(Number);
export const TODAY = new Date(gy, gm - 1, gd);

export const PROVIDERS: Provider[] = [
  { id:"CI", slug:"bank", n:{de:"Bank / Kreditinstitut",en:"Bank / credit institution"},
    s:{de:"Einlagen- und Kreditgeschäft nach KWG und CRR",en:"Deposit-taking and lending under KWG and CRR"},
    tags:["CRR III","MaRisk","DORA","AMLA"] },
  { id:"AM", slug:"asset-manager", n:{de:"Asset Manager / KVG",en:"Asset manager / fund manager"},
    s:{de:"AIF- oder OGAW-Verwaltung nach KAGB",en:"AIF or UCITS management under KAGB"},
    tags:["AIFMD II","SFDR","ELTIF 2.0","DORA"] },
  { id:"IF", slug:"wertpapierinstitut", n:{de:"Wertpapierinstitut",en:"Investment firm"},
    s:{de:"Wertpapierdienstleistungen nach WpIG und MiFID II",en:"Investment services under WpIG and MiFID II"},
    tags:["MiFID II","IFR/IFD","MAR","DORA"] },
  { id:"PI", slug:"zahlungsinstitut", n:{de:"Zahlungs- / E-Geld-Institut",en:"Payment / e-money institution"},
    s:{de:"Zahlungsdienste und E-Geld nach ZAG",en:"Payment services and e-money under ZAG"},
    tags:["PSD3/PSR","Instant Payments","MiCA","AMLA"] },
  { id:"INS", slug:"versicherung", n:{de:"Versicherungsunternehmen",en:"Insurance undertaking"},
    s:{de:"Versicherungsgeschäft nach VAG und Solvency II",en:"Insurance business under VAG and Solvency II"},
    tags:["Solvency II","IDD","SFDR","DORA"] },
  { id:"OTH", slug:"sonstige", n:{de:"Leasing, Factoring, Sonstige",en:"Leasing, factoring, other"},
    s:{de:"Finanzdienstleistungen mit eingeschränkter Erlaubnis",en:"Financial services under a limited licence"},
    tags:["GwG","HinSchG","NIS-2","BGB"] }
];

export const TOPICS: Topic[] = [
  { id:"ICT", n:{de:"IT & digitale Resilienz",en:"IT & digital resilience"},
    d:{de:"IKT-Risikomanagement, Vorfallmeldung, Auslagerung an IT-Dienstleister, Cybersicherheit.",
       en:"ICT risk management, incident reporting, outsourcing to IT providers, cybersecurity."} },
  { id:"AML", n:{de:"Geldwäscheprävention",en:"Financial crime & AML"},
    d:{de:"Sorgfaltspflichten, Verdachtsmeldungen, wirtschaftlich Berechtigte, Sanktionen.",
       en:"Due diligence, suspicious activity reporting, beneficial ownership, sanctions."} },
  { id:"PRU", n:{de:"Eigenmittel & Aufsichtsrecht",en:"Capital & prudential"},
    d:{de:"Eigenmittel, Liquidität, Risikomessung, Sanierung und Abwicklung.",
       en:"Own funds, liquidity, risk measurement, recovery and resolution."} },
  { id:"GOV", n:{de:"Governance & Auslagerung",en:"Governance & outsourcing"},
    d:{de:"Organisationspflichten, Auslagerungsmanagement, Hinweisgeberschutz, Vergütung.",
       en:"Organisational duties, outsourcing management, whistleblowing, remuneration."} },
  { id:"MKT", n:{de:"Wertpapiergeschäft & Anlegerschutz",en:"Markets & investor protection"},
    d:{de:"Wohlverhaltensregeln, Marktintegrität, Produktinformation, Vertrieb.",
       en:"Conduct rules, market integrity, product disclosure, distribution."} },
  { id:"PAY", n:{de:"Zahlungsverkehr",en:"Payments"},
    d:{de:"Zahlungsdienste, starke Kundenauthentifizierung, Echtzeitzahlungen, Kryptowerte.",
       en:"Payment services, strong customer authentication, instant payments, crypto-assets."} },
  { id:"FND", n:{de:"Fondsregulierung",en:"Fund regulation"},
    d:{de:"Fondsverwaltung, Liquiditätsinstrumente, Verwahrstelle, Produktregime.",
       en:"Fund management, liquidity tools, depositary, product regimes."} },
  { id:"ESG", n:{de:"Nachhaltigkeit",en:"Sustainability"},
    d:{de:"Offenlegung, Taxonomie, Berichterstattung, ESG-Risiken.",
       en:"Disclosure, taxonomy, reporting, ESG risks."} },
  { id:"REP", n:{de:"Meldewesen",en:"Supervisory reporting"},
    d:{de:"Meldetaxonomien, Einreichungsfristen, statistische Meldungen.",
       en:"Reporting taxonomies, submission deadlines, statistical returns."} },
  { id:"INSU", n:{de:"Versicherungsaufsicht",en:"Insurance supervision"},
    d:{de:"Solvenzkapital, Governance, Vertrieb, Berichterstattung.",
       en:"Solvency capital, governance, distribution, reporting."} },
  { id:"DATA", n:{de:"Datenschutz & Digitales",en:"Data protection & digital"},
    d:{de:"Personenbezogene Daten, digitale Identität, Einsatz von KI-Systemen.",
       en:"Personal data, digital identity, use of AI systems."} },
  { id:"CONS", n:{de:"Verbraucherschutz",en:"Consumer protection"},
    d:{de:"Verbraucherdarlehen, vorvertragliche Information, faire Vertragsbedingungen.",
       en:"Consumer credit, pre-contractual information, fair contract terms."} }
];

/** Aufsichtspraxis-Meldung (Bußgeld, Verwarnung, Maßnahme …) — bewusst kein
 *  regulatorisches Update: eigener Bestand für /praxis und den monatlich
 *  aggregierten Praxis-Newsletter. */
export interface PraxisItem {
  d: string;    // "28.08.2026"
  ti: string;   // Originaltitel
  auth: string; // Behörde ("BaFin")
  src: string;  // Quelldomain ("bafin.de")
  url: string;  // Primärquelle
  cat: "bussgeld" | "zwangsgeld" | "verwarnung" | "massnahme" | "rede";
  sum?: string; // gescrapte Kurzbeschreibung (Hintergrund, Betragshöhe)
}

export const PRAXIS_CAT_LABELS: Record<PraxisItem["cat"], { de: string; en: string }> = {
  bussgeld: { de: "Bußgeld", en: "Fine" },
  zwangsgeld: { de: "Zwangsgeld", en: "Penalty payment" },
  verwarnung: { de: "Verwarnung", en: "Reprimand" },
  massnahme: { de: "Maßnahme", en: "Measure" },
  rede: { de: "Rede", en: "Speech" },
};
