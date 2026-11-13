// Abgleich Institutsprofil × Update: Ja / Ja, teilweise / Nein / Unsicher.
//
// Ablauf (günstigste Stufe zuerst):
// 0. Regel-Vorfilter auf Basis der Anforderungsanalyse (scopes.json): klare
//    Fälle (richtet sich nicht an Institute, keine Adressatengruppe erfüllbar,
//    Adressat ohne Teilregeln) entscheiden ohne KI.
// 1. Abgleich A (günstiges Modell) mit Begründung und genutzten Merkmalen.
// 2. QS 1, regelbasiert: genannte Merkmale müssen im Profil stimmen, das
//    Urteil darf der Anforderungsanalyse nicht widersprechen.
// 3. QS 2: Modell B aus einem anderen Haus urteilt unabhängig.
// 4. Bei Widerspruch entscheidet der Schiedsrichter; scheitert er, bleibt es
//    bei „unsicher“ mit Rückfrage.
// Speicherung (Kosten, Nutzerentscheidung 07.11.2026): Jedes Paar aus Profil
// und Ziel wird genau einmal geprüft und je Profil festgehalten (Redis-Hash
// relp:1:<Profil>:<Generation>, die Generation bleibt seit 07.11.2026 fest).
// Ein Komplettlauf füllt den Speicher direkt nach dem Anlegen (server.ts,
// prefillProfile). Es gibt kein „Neu prüfen“. Ändert der Nutzer sein Profil,
// werden nur die Ergebnisse gelöscht und neu geprüft, die an den geänderten
// Merkmalen hängen (invalidateChanged). Profile mit gleichen Merkmalen teilen
// sich KI-Ergebnisse (relm:<Signatur>). Vom Nutzer gesetzte Status
// (relo:1:<Profil>) gehen allem vor und lösen keine Prüfung aus. Server-only.

import { featureById, featureLabel, FEATURE_IDS, FEATURES } from "./catalog";
import { BudgetError, chatJson, MODELS } from "./llm";
import { changedFeatures, featureValue, profileSignature, profileValues, type Profile, type Tri } from "./profile";
import { scopeForTarget, SCOPE_FORMAT, type Group, type Scope } from "./scopes";
import { redis } from "../subscribers";
import type { Framework, Update } from "../data";

export type Status = "ja" | "teilweise" | "nein" | "unsicher";

export interface MatchResult {
  status: Status;
  grund: string;
  teile?: string;
  frage?: { merkmal: string; frage: string };
  /** Weitere offene Rückfragen (nur bei „unsicher“). */
  weitere?: { merkmal: string; frage: string }[];
  /** Profilmerkmale, auf die sich das Urteil stützt (für die Wiederverwendung). */
  merkmale?: string[];
  art?: Scope["art"];
  /** "vorlaeufig": Ersatzeinschätzung ohne KI (Anbieter nicht erreichbar oder
      Budget erschöpft). Wird nie gespeichert; die nächste Prüfung ersetzt sie. */
  stufe: "regel" | "ki" | "schiedsrichter" | "fallback" | "vorlaeufig" | "nutzer";
  /** Bei stufe "nutzer": die automatische Einschätzung, falls vorhanden. */
  auto?: { status: Status; grund: string };
  /** Bei stufe "nutzer": Begründung des Nutzers (optional). */
  notiz?: string;
  kostenUsd: number;
  at: string;
}

export interface MatchTarget { key: string; fw: Framework; u?: Update }

const MATCH_VERSION = 2; // 2: neue Modelle (07.11.2026)
const TTL = 60 * 60 * 24 * 180;

/* ---------- Regel-Vorfilter ---------- */

type GroupEval = { v: Tri; unknown: string[] };

/* Bankaufsichtliche Merkmale gibt es nur bei Kreditinstituten, großen
   Wertpapierinstituten und Finanzholdings (Befund 11.11.2026: Leasing-
   Institute und Versicherer wurden nach SNCI und IRB gefragt). */
const BANK_ONLY = new Set(["si", "lsi", "lsi_hi", "snci", "bedeutend_ivv", "osii", "gsii", "irb", "handelsbuch_klein"]);
const BANKLIKE = ["ki", "ki_crr", "bausparkasse", "foerderbank", "wpi_gross", "finanzholding"];
const SEATS = ["sitz_de", "sitz_lu", "sitz_eu"];

/** Merkmalswert für die Regeln: wie im Profil, dazu was sich sicher ergibt,
    auch wenn es (in älteren Profilen) nicht eingetragen ist: Ein Institut hat
    genau einen Sitz, und bankaufsichtliche Merkmale treffen auf Nicht-Banken
    mit vollständig bekannter Institutsart nicht zu. */
export function ruleValue(p: Profile, id: string): Tri {
  const v = featureValue(p, id);
  if (v !== null) return v;
  if (SEATS.includes(id) && SEATS.some((s) => s !== id && featureValue(p, s) === true)) return false;
  if (id === "taetig_de" && featureValue(p, "sitz_de") === true) return true;
  if (BANK_ONLY.has(id) && p.closed && !BANKLIKE.some((b) => featureValue(p, b) === true)) return false;
  // Global systemrelevant ist kein weniger bedeutendes Institut und kein Haus
  // unter 30 Mrd. € Bilanzsumme (Befund 11.11.2026: kleine Banken wurden
  // nach G-SRI gefragt).
  if (id === "gsii" && (featureValue(p, "lsi") === true || featureValue(p, "bs_ab_30mrd") === false)) return false;
  // Lebens- und Krankenversicherer haben ihrem Geschäft nach Privatkunden
  // (PRIIPs und Anlegerschutz hingen sonst an einer offenen Frage).
  if (id === "privatkunden" && ["versicherer_leben", "versicherer_kranken"].some((x) => featureValue(p, x) === true)) return true;
  // LkSG-Schwelle: Kleinstunternehmen und Häuser mit unter 50 Mio. €
  // Bilanzsumme haben keine 1.000 Beschäftigten.
  if (id === "beschaeftigte_ab_1000"
    && (featureValue(p, "kleinstunternehmen") === true || (p.bilanzsumme?.mrd != null && p.bilanzsumme.mrd < 0.05))) return false;
  // Eine ECSP-Zulassung steht im Register; Profile ohne vollständige
  // Registerdaten (EZB-, EIOPA-Liste) mit bekannter anderer Institutsart haben sie nicht.
  if (id === "ecsp" && FEATURES.some((f) => f.g === "art" && f.id !== "ecsp" && featureValue(p, f.id) === true)) return false;
  return null;
}

/* Verbraucherschützende Vorgaben gelten als Recht des Allgemeininteresses
   auch im grenzüberschreitenden Dienstleistungsverkehr. */
const CONSUMER = new Set(["privatkunden", "verbraucherkredit", "wohnimmobilienkredit", "zahlungskonten"]);

/** EWR-Institut, das in Deutschland nur im grenzüberschreitenden
    Dienstleistungsverkehr tätig ist (§ 53b KWG, keine Zweigniederlassung):
    Organisations-, Melde- und Geldwäschepflichten folgen dem Recht des
    Herkunftsstaats. Deutsche Vorgaben, die nur an „tätig in Deutschland“
    anknüpfen, treffen ein solches Haus daher nicht, außer sie schützen
    Verbraucher (Befund 11.11.2026: österreichische Bausparkasse bekam GwG,
    AnaCredit und Kreditzweitmarktgesetz als Treffer). */
export function passportOnly(p: Profile): boolean {
  return featureValue(p, "eu_pass") === true && featureValue(p, "sitz_de") !== true
    && featureValue(p, "zweigstelle_drittstaat") !== true;
}

function evalGroup(p: Profile, g: Group): GroupEval {
  const unknown: string[] = [];
  for (const id of g.alle) {
    const v = ruleValue(p, id);
    if (v === false) return { v: false, unknown: [] };
    if (v === null) unknown.push(id);
  }
  return { v: unknown.length ? null : true, unknown };
}

export interface RuleResult {
  decided?: MatchResult;
  hits: Group[];
  open: GroupEval[];
  allFalse: boolean;
}

export function ruleCheck(p: Profile, scope: Scope | undefined): RuleResult {
  const at = new Date().toISOString();
  if (!scope) return { hits: [], open: [], allFalse: false };
  const base = { art: scope.art, kostenUsd: 0, at, stufe: "regel" as const };
  if (scope.art === "keine_institute") {
    return {
      decided: { ...base, status: "nein", grund: "Nicht einschlägig, weil es sich nicht unmittelbar an Institute richtet." },
      hits: [], open: [], allFalse: true,
    };
  }
  const excluded = scope.ausschluesse.find((g) => evalGroup(p, g).v === true);
  if (excluded) {
    return {
      decided: { ...base, status: "nein", grund: `Nicht einschlägig, weil ausgenommen: ${excluded.alle.map(featureLabel).join(", ")}.`, merkmale: excluded.alle },
      hits: [], open: [], allFalse: true,
    };
  }
  const evals = scope.adressaten.map((g) => ({ g, e: evalGroup(p, g) }));
  let hits = evals.filter((x) => x.e.v === true).map((x) => x.g);
  if (hits.length > 0 && passportOnly(p)) {
    const own = hits.filter((g) => !g.alle.includes("taetig_de"));
    if (own.length > 0) hits = own;
    else {
      const consumer = hits.find((g) => g.alle.some((id) => CONSUMER.has(id)));
      const merkmale = ["eu_pass", "taetig_de", "sitz_de", "zweigstelle_drittstaat", ...(consumer?.alle ?? [])];
      return {
        decided: consumer
          ? {
            ...base, status: "teilweise", merkmale,
            grund: `Einschlägig, soweit Verbraucher in Deutschland betroffen sind (${consumer.alle.filter((id) => CONSUMER.has(id)).map(featureLabel).join(", ")}).`,
            teile: "Ihr Haus ist in Deutschland nur im grenzüberschreitenden Dienstleistungsverkehr tätig (§ 53b KWG). Es gelten die verbraucherschützenden Teile; Organisations- und Meldepflichten richten sich nach dem Recht des Herkunftsstaats.",
          }
          : {
            ...base, status: "nein", merkmale,
            grund: "Nicht einschlägig, weil in Deutschland nur im grenzüberschreitenden Dienstleistungsverkehr tätig (§ 53b KWG): Es gilt das Aufsichtsrecht des Herkunftsstaats.",
          },
        hits: [], open: [], allFalse: !consumer,
      };
    }
  }
  const open = evals.filter((x) => x.e.v === null).map((x) => x.e);
  const allFalse = evals.length > 0 && evals.every((x) => x.e.v === false);
  // Konsolidierte Pflichten treffen auch Finanzholdings und übergeordnete
  // Unternehmen, selbst wenn die Analyse nur die Institutsart nennt
  // (Beispiel GRENKE AG: Leasing-Erlaubnis, aber Finanzholding über einer
  // CRR-Bank). Dann entscheidet nicht die Regel, sondern die KI.
  // Greift nur, wenn das Haus selbst kein CRR-Institut ist und eine
  // Adressatengruppe allein an der Institutsart scheitert (alle übrigen
  // Merkmale wie Sitz oder Geschäft treffen zu).
  // Ein nachgeordnetes Unternehmen (laut GLEIF Tochter in der Gruppe) trägt
  // die konsolidierten Pflichten nicht, auch wenn im Profil zusätzlich
  // „übergeordnet“ angegeben ist (Befund 11.11.2026: Leasing-Tochter bekam
  // 268 CRR-Vorgaben „auf konsolidierter Ebene“).
  const holder = featureValue(p, "finanzholding") === true
    || (featureValue(p, "gruppe_uebergeordnet") === true && featureValue(p, "gruppe_nachgeordnet") !== true
      && featureValue(p, "ki_crr") !== true
      && ["ki", "fdi", "leasing_factoring", "wpi"].some((x) => featureValue(p, x) === true));
  const consolidated = scope.ebene !== "einzel" && holder && scope.adressaten.some((g) =>
    g.alle.some((id) => ["ki_crr", "ki", "wpi_gross"].includes(id))
    && g.alle.every((id) => featureById(id)?.g === "art" || ruleValue(p, id) === true));
  if (allFalse && !consolidated) {
    return {
      decided: { ...base, status: "nein", grund: `Nicht einschlägig, weil es sich nur richtet an: ${(scope.kurz || scope.adressaten.map((g) => g.alle.map(featureLabel).join(" + ")).join("; ")).replace(/\.+$/, "")}.` },
      hits, open, allFalse,
    };
  }
  /* Seit 11.11.2026 entscheiden die Regeln jeden Fall, für den es eine
     Anforderungsanalyse mit Adressaten gibt (Nutzerentscheidung: Wenn-Dann-
     Regeln statt KI je Profil; die KI-Arbeit steckt einmalig in der Analyse
     je Meldung). Die KI prüft nur noch Ziele ganz ohne Analyse. */
  if (evals.length === 0) return { hits, open, allFalse: false };
  if (hits.length > 0) {
    // Teilregeln: Erleichterung greift oder ein Zusatzteil entfällt → teilweise.
    const gilt: string[] = [];
    const entfaellt: string[] = [];
    const used = new Set(hits[0].alle);
    for (const t of scope.teilregeln) {
      if (!t.gilt_fuer.length) continue;
      const es = t.gilt_fuer.map((g) => evalGroup(p, g).v);
      const v: Tri = es.includes(true) ? true : es.every((x) => x === false) ? false : null;
      if (v === null) continue;
      t.gilt_fuer.forEach((g) => g.alle.forEach((x) => used.add(x)));
      if (v && t.erleichterung) gilt.push(`${t.teil}${t.hinweis ? ` (${t.hinweis})` : ""}`);
      else if (!v && !t.erleichterung) entfaellt.push(t.teil);
    }
    const partial = gilt.length > 0 || entfaellt.length > 0;
    const teile = [gilt.length ? `Erleichterung: ${gilt.join("; ")}` : "", entfaellt.length ? `Entfällt: ${entfaellt.join("; ")}` : ""]
      .filter(Boolean).join(". ").slice(0, 300);
    return {
      decided: {
        ...base, status: partial ? "teilweise" : "ja", ...(partial ? { teile } : {}),
        grund: `Einschlägig, weil ${hits[0].alle.map(featureLabel).join(" + ")}.`, merkmale: [...used],
      },
      hits, open, allFalse,
    };
  }
  if (allFalse && consolidated) {
    return {
      decided: {
        ...base, status: "teilweise", merkmale: ["finanzholding", "gruppe_uebergeordnet"],
        grund: "Einschlägig auf konsolidierter Ebene, weil übergeordnetes Unternehmen einer Gruppe.",
        teile: `Die Vorgabe richtet sich an: ${(scope.kurz || "gruppenangehörige Institute").replace(/\.+$/, "")}. Sie betrifft Ihr Haus, soweit solche Institute zur Gruppe gehören.`.slice(0, 300),
      },
      hits, open, allFalse: false,
    };
  }
  // Kein Treffer, aber mindestens eine Gruppe hängt an unbekannten Merkmalen:
  // Rückfrage zur Gruppe mit den wenigsten offenen Merkmalen.
  if (open.length > 0) {
    const best = [...open].sort((a, b) => a.unknown.length - b.unknown.length)[0];
    const ids = [...new Set([...best.unknown, ...open.flatMap((o) => o.unknown)])];
    const ask = (id: string) => scope.fragen.find((f) => f.merkmal === id) ?? { merkmal: id, frage: `Trifft auf Ihr Institut zu: ${featureLabel(id)}?` };
    return {
      decided: {
        ...base, status: "unsicher", merkmale: ids,
        grund: `Unklar, weil offen ist: ${best.unknown.map(featureLabel).join(", ")}.`.slice(0, 400),
        frage: ask(ids[0]), weitere: ids.slice(1, 4).map(ask),
      },
      hits, open, allFalse,
    };
  }
  return { hits, open, allFalse: allFalse && !consolidated };
}

/* ---------- KI-Abgleich ---------- */

function profileText(p: Profile): string {
  const yes: string[] = [];
  const no: string[] = [];
  const unknown: string[] = [];
  for (const f of FEATURES) {
    const v = featureValue(p, f.id);
    if (v === true) yes.push(`${f.id} (${f.l})`);
    else if (v === false && !(p.closed && (f.g === "art" || f.g === "erl"))) no.push(f.id);
    else if (v === null && f.g !== "art" && f.g !== "erl") unknown.push(f.id);
  }
  return JSON.stringify({
    institut: p.name,
    gattung: p.gattung,
    erlaubnisse: p.licenses.map((l) => l.text),
    bilanzsumme_mrd: p.bilanzsumme?.mrd ?? null,
    gruppe: p.group ?? null,
    merkmale_ja: yes,
    merkmale_nein: no,
    merkmale_unbekannt: unknown,
    hinweis: p.closed
      ? "Institutsart und Erlaubnisse sind vollständig: Arten und Erlaubnisse, die nicht unter merkmale_ja stehen, treffen NICHT zu."
      : "Institutsart und Erlaubnisse sind nur teilweise bekannt.",
  });
}

function targetText(t: MatchTarget, scope: Scope | undefined): string {
  const { fw, u } = t;
  return JSON.stringify({
    meldung: u
      ? { titel: u.ti.de, typ: u.t.de, quelle: u.src, datum: u.d, frist: u.deadline, gilt_ab: u.eff, zusammenfassung: u.s.de }
      : { titel: `Rahmenwerk ${fw.n.de}`, typ: "Rahmenwerk", zusammenfassung: fw.about.de },
    rahmenwerk: { name: fw.n.de, rechtsakt: fw.ref, rechtsraum: fw.jur },
    anforderungsanalyse: scope ?? "nicht vorhanden: Anwendungsbereich selbst aus Meldung und Rahmenwerk bestimmen",
  });
}

const MATCH_SYSTEM = `Du prüfst als Compliance-Analyst, ob eine regulatorische Meldung für ein bestimmtes Finanzinstitut einschlägig ist,
d. h. ob das Institut in ihren Anwendungsbereich fällt (bei Entwürfen: künftig fallen würde). Grundlage sind das Institutsprofil
(Merkmale ja/nein/unbekannt, Erlaubnisse) und die Anforderungsanalyse der Meldung (Adressatengruppen: alle Merkmale einer Gruppe
müssen zutreffen; Ausschlüsse; Teilregeln).

Status:
- "ja": Das Institut ist Adressat; die Vorgabe gilt vollständig.
- "teilweise": Das Institut ist Adressat, aber nur einzelne Teile gelten oder es greifen Erleichterungen (z. B. SNCI, kleines
  Handelsbuch, keine Zusatzpflichten für bedeutende Institute). Nenne in "teile", welche Teile gelten bzw. entfallen.
- "nein": Das Institut ist kein Adressat oder ausdrücklich ausgenommen, oder die Meldung richtet sich nicht an Institute.
- "unsicher": NUR wenn die Entscheidung an einem Merkmal hängt, das im Profil unbekannt ist. Dann "frage" mit genau diesem
  Merkmal (ID aus dem Katalog) und einer kurzen Frage an das Institut.
Entscheide zwischen ja und nein, wann immer die bekannten Merkmale es erlauben. Nationale BaFin-Vorgaben betreffen nur in
Deutschland tätige Institute. Konsolidierte Pflichten treffen auch Finanzholdings bzw. übergeordnete Unternehmen.

Ohne Anforderungsanalyse (ganzes Rahmenwerk statt einzelner Meldung) bestimmst du den Anwendungsbereich streng nach den
Normadressaten des Rechtsakts:
- "ja" oder "teilweise" nur, wenn das Institut wegen seiner Institutsart, Erlaubnisse oder bekannten Geschäftsmerkmale
  unmittelbar eigene Pflichten aus dem Rechtsakt hat. Mittelbare Berührung (als Kunde, Nutzer, Investor, Vertragspartner)
  reicht nicht.
- Regelwerke für bestimmte Anbieter (z. B. ESG-Rating-Anbieter, Ratingagenturen, Benchmark-Administratoren, Zentralverwahrer,
  Handelsplätze, Kryptowerte-Dienstleister, Kapitalverwaltungsgesellschaften, Versicherer) sind "nein", wenn das Institut
  kein solcher Anbieter ist.
- Freiwillige Standards und Labels (z. B. EU Green Bond Standard) sind "nein", solange nichts darauf hinweist, dass das
  Institut sie nutzt.
- Pflichten, die an Wertpapierdienstleistungen, Anlageberatung, Portfolioverwaltung, Herstellung oder Vertrieb von PRIIPs,
  Derivate- oder Wertpapierfinanzierungsgeschäfte, Zahlungskonten oder Kartengeschäft anknüpfen: "nein", wenn Erlaubnisse
  oder Merkmale die Tätigkeit ausschließen (bei vollständigen Erlaubnissen zählt eine fehlende Erlaubnis als Ausschluss);
  "unsicher" mit dem passenden Merkmal, wenn es unbekannt ist.
- Querschnittsregeln für alle Institute (z. B. DORA, Geldwäsche, Datenschutz, Hinweisgeberschutz) bleiben "ja".

Bankaufsichtliche Merkmale (SI/LSI, SNCI, O-SII, G-SII, IRB, kleines Handelsbuch, bedeutend nach IVV) betreffen nur
Kreditinstitute, große Wertpapierinstitute und Finanzholdings. Bei anderen Institutsarten gelten sie als nicht zutreffend und
sind kein Grund für "unsicher". Bei status "unsicher" beginnt "grund" mit „Unklar, weil …“. Nenne im "grund" keine internen
Bezeichnungen (Merkmals-IDs, Gruppennummern der Anforderungsanalyse) und begründe mit dem Rechtsakt der Meldung, nicht mit
einem anderen.

Antworte nur als JSON: {"status": "ja|teilweise|nein|unsicher", "teile": "…" | null, "grund": "EIN kurzer Satz mit dem
entscheidenden Merkmal, beginnend mit „Einschlägig, weil …“ bzw. „Nicht einschlägig, weil …“ (z. B. „Einschlägig, weil
CRR-Kreditinstitut mit Einlagengeschäft.“, „Nicht einschlägig, weil Bilanzsumme unter 1 Mrd. €.“), höchstens 140 Zeichen", "merkmale": ["IDs der Profilmerkmale, auf die du dich stützt"], "frage": {"merkmal": "id", "frage": "…"} | null}`;

interface LlmVerdict {
  status?: string;
  teile?: string | null;
  grund?: string;
  merkmale?: string[];
  frage?: { merkmal?: string; frage?: string } | null;
}

const STATUSES: Status[] = ["ja", "teilweise", "nein", "unsicher"];
const norm = (v: LlmVerdict): Required<Pick<LlmVerdict, "grund">> & { status: Status; teile?: string; merkmale: string[]; frage?: { merkmal: string; frage: string } } => ({
  status: STATUSES.includes(v.status as Status) ? (v.status as Status) : "unsicher",
  teile: v.teile ? String(v.teile).slice(0, 300) : undefined,
  grund: String(v.grund ?? "").slice(0, 400),
  merkmale: (v.merkmale ?? []).filter((m) => FEATURE_IDS.has(m)),
  frage: v.frage?.merkmal && FEATURE_IDS.has(v.frage.merkmal)
    ? { merkmal: v.frage.merkmal, frage: String(v.frage.frage ?? featureLabel(v.frage.merkmal)).slice(0, 200) }
    : undefined,
});
type Verdict = ReturnType<typeof norm>;

/** QS 1: Plausibilität gegen Profil und Anforderungsanalyse. */
function qs1(p: Profile, v: Verdict, rules: RuleResult): string[] {
  const issues: string[] = [];
  const relevant = v.status === "ja" || v.status === "teilweise";
  if (relevant) {
    const wrong = v.merkmale.filter((m) => featureValue(p, m) === false);
    if (wrong.length) issues.push(`Stützt sich auf Merkmale, die laut Profil nicht zutreffen: ${wrong.join(", ")}`);
    if (rules.allFalse) issues.push("Laut Anforderungsanalyse erfüllt das Profil keine Adressatengruppe");
  }
  if (v.status === "nein" && rules.hits.length > 0) {
    issues.push(`Profil erfüllt die Adressatengruppe ${rules.hits[0].alle.join(" + ")} vollständig`);
  }
  if (v.status === "unsicher") {
    if (!v.frage) issues.push("Unsicher ohne Rückfrage zu einem unbekannten Merkmal");
    else if (featureValue(p, v.frage.merkmal) !== null) issues.push(`Rückfrage zu ${v.frage.merkmal}, das im Profil bereits bekannt ist`);
  }
  return issues;
}

const relevantSide = (s: Status) => (s === "ja" || s === "teilweise" ? "rel" : s);

async function llmMatch(p: Profile, t: MatchTarget, scope: Scope | undefined, rules: RuleResult): Promise<MatchResult> {
  const user = `INSTITUTSPROFIL:\n${profileText(p)}\n\nMELDUNG UND ANFORDERUNGSANALYSE:\n${targetText(t, scope)}`;
  let cost = 0;
  const at = new Date().toISOString();
  const [sa, sb] = await Promise.allSettled([
    chatJson<LlmVerdict>({ model: MODELS.matchA, system: MATCH_SYSTEM, user, maxTokens: 5000 }),
    chatJson<LlmVerdict>({ model: MODELS.matchB, system: MATCH_SYSTEM, user, maxTokens: 5000 }),
  ]);
  const failed = [sa, sb].filter((x): x is PromiseRejectedResult => x.status === "rejected");
  if (failed.some((x) => x.reason instanceof BudgetError)) throw new BudgetError();
  if (failed.length === 2) throw failed[0].reason;
  const ok = (x: typeof sa) => (x.status === "fulfilled" ? x.value : null);
  const a = ok(sa);
  const b = ok(sb);
  cost += (a?.costUsd ?? 0) + (b?.costUsd ?? 0);
  const va = a ? norm(a.data) : undefined;
  const vb = b ? norm(b.data) : undefined;
  const issuesA = va ? qs1(p, va, rules) : [];
  const issuesB = vb ? qs1(p, vb, rules) : [];
  const done = (v: Verdict, stufe: MatchResult["stufe"] = "ki"): MatchResult => ({
    status: v.status, grund: v.grund, teile: v.teile, frage: v.frage, merkmale: v.merkmale, art: scope?.art, stufe, kostenUsd: cost, at,
  });

  if (va && vb) {
    const agree = relevantSide(va.status) === relevantSide(vb.status)
      && (va.status !== "unsicher" || va.frage?.merkmal === vb.frage?.merkmal || !!va.frage);
    if (agree && issuesA.length === 0) {
      const status: Status = va.status === "teilweise" || vb.status === "teilweise"
        ? (va.status === "ja" && vb.status === "ja" ? "ja" : "teilweise")
        : va.status;
      return {
        ...done(va), status, teile: va.teile ?? vb.teile, frage: va.frage ?? vb.frage,
        merkmale: [...new Set([...va.merkmale, ...vb.merkmale])],
      };
    }
    if (agree && issuesB.length === 0) return done(vb);
  } else {
    // Ein Prüfer ausgefallen: Der andere entscheidet allein, wenn sein Urteil
    // die Regelprüfung besteht; sonst entscheidet der Schiedsrichter.
    const single = (va ?? vb)!;
    if ((va ? issuesA : issuesB).length === 0) return done(single);
  }

  // Schiedsrichter: sieht beide Urteile und die QS-1-Befunde.
  try {
    const arb = await chatJson<LlmVerdict>({
      model: MODELS.arbiter,
      system: `${MATCH_SYSTEM}\n\nZwei Prüfer kamen zu unterschiedlichen oder fehlerhaften Ergebnissen. Prüfe beide gegen Profil und
Anforderungsanalyse und entscheide selbst. Befunde der Regelprüfung sind Fakten.`,
      user: `${user}\n\nPRÜFER A: ${va ? JSON.stringify(va) : "ausgefallen"}\nBefunde Regelprüfung A: ${JSON.stringify(issuesA)}\n\nPRÜFER B: ${vb ? JSON.stringify(vb) : "ausgefallen"}\nBefunde Regelprüfung B: ${JSON.stringify(issuesB)}`,
      maxTokens: 5000,
    });
    cost += arb.costUsd;
    const vc = norm(arb.data);
    if (qs1(p, vc, rules).length === 0) return done(vc, "schiedsrichter");
  } catch (e) {
    if (e instanceof BudgetError) throw e;
    console.error("arbiter failed:", e);
  }
  // Auch dieses „Unklar“ ist ein fertiges Ergebnis und wird gespeichert
  // (früher stufe "fallback": lief bei jedem Seitenaufruf erneut).
  const frage = va?.frage ?? vb?.frage ?? fallbackQuestion(p, scope, rules);
  return {
    status: "unsicher",
    grund: "Unklar, weil die Angaben im Profil für eine sichere Einschätzung nicht reichen.",
    frage, merkmale: frage ? [frage.merkmal] : [], art: scope?.art, stufe: "ki", kostenUsd: cost, at,
  };
}

const askable = (p: Profile, id: string) => ruleValue(p, id) === null;

function fallbackQuestion(p: Profile, scope: Scope | undefined, rules: RuleResult) {
  const fromScope = scope?.fragen.find((f) => askable(p, f.merkmal));
  if (fromScope) return fromScope;
  const id = rules.open.flatMap((o) => o.unknown).find((x) => askable(p, x));
  return id ? { merkmal: id, frage: `Trifft auf Ihr Institut zu: ${featureLabel(id)}?` } : undefined;
}

/* ---------- Öffentliche API ---------- */

// Rahmenwerk-Ziele (f:) eigene Version: strengere Adressatenregel seit 07.11.2026.
const FW_MATCH_VERSION = 3;
const cacheKey = (t: MatchTarget, sig: string) =>
  `relm:${t.u ? MATCH_VERSION : `f${FW_MATCH_VERSION}`}.${SCOPE_FORMAT}:${t.key}:${sig}`;
/** Festgehaltene Ergebnisse je Profil (Hash, Feld = Ziel). Die Generation
    stammt aus der Zeit von „Neu prüfen“ und bleibt seitdem fest. */
const storeKey = (p: Profile) => `relp:1:${p.id}:${p.check?.gen ?? 0}`;
const overrideKey = (p: Profile) => `relo:1:${p.id}`;
const failKey = (p: Profile) => `relf:1:${p.id}`;
const lockKey = (p: Profile, key: string) => `rlock:${p.id}:${key}`;
const STORE_TTL = 60 * 60 * 24 * 400;
/** Nach so vielen API-Fehlern je Paar bleibt es bei „Unklar“ (keine Endlosschleife). */
const MAX_FAILS = 3;

/** „Unklar“, dessen Rückfrage das Profil inzwischen beantwortet: neu prüfen. */
const answered = (p: Profile, r: MatchResult) =>
  r.status === "unsicher" && !!r.frage && featureValue(p, r.frage.merkmal) !== null;

function scopeFeatures(scope: Scope): Set<string> {
  // Konsolidierte Pflichten treffen auch Finanzholdings und übergeordnete
  // Unternehmen (ruleCheck); bei reinen Einzelpflichten spielen sie keine Rolle.
  const ids = new Set<string>(scope.ebene !== "einzel" ? ["finanzholding", "gruppe_uebergeordnet"] : []);
  const add = (gs: Group[]) => gs.forEach((g) => g.alle.forEach((x) => ids.add(x)));
  add(scope.adressaten);
  add(scope.ausschluesse);
  scope.teilregeln.forEach((t) => add(t.gilt_fuer));
  scope.schwellen.forEach((x) => ids.add(x.merkmal));
  scope.fragen.forEach((x) => ids.add(x.merkmal));
  return ids;
}

/** Bleibt ein gespeichertes Ergebnis nach einer Profiländerung gültig?
    `isTrue` liefert den neuen Wert eines Merkmals. */
export function stillValid(
  r: MatchResult, changed: Set<string>, scope: Scope | undefined, isTrue: (id: string) => boolean,
): boolean {
  if (r.stufe === "fallback" || r.stufe === "vorlaeufig") return false;
  if (changed.size === 0) return true;
  if (r.stufe === "regel" && r.art === "keine_institute") return true;
  const used = new Set([
    ...(r.merkmale ?? []), ...(r.frage ? [r.frage.merkmal] : []), ...(r.weitere ?? []).map((w) => w.merkmal),
  ]);
  if ([...changed].some((c) => used.has(c))) return false;
  if (scope) {
    const rel = scopeFeatures(scope);
    return ![...changed].some((c) => rel.has(c));
  }
  // Ohne Anforderungsanalyse (Rahmenwerke, kuratierte Chronologie-Einträge):
  // Eine andere Institutsart kann jedes Urteil kippen. Sonst gilt: Ein „Ja“
  // kippt nur, wenn ein Merkmal wegfällt, auf das es sich stützt (oben
  // geprüft). Ein „Nein“ oder „Unklar“ kann kippen, wenn eine Erlaubnis, ein
  // Geschäft oder ein Aufsichtsmerkmal hinzukommt.
  if ([...changed].some((c) => featureById(c)?.g === "art")) return false;
  if (r.status === "ja" || r.status === "teilweise") return true;
  return ![...changed].some((c) => c === "lic" || (featureById(c)?.g !== "recht" && isTrue(c)));
}

/** Nach einer Profiländerung: nur die Ergebnisse löschen, die an den
    geänderten Merkmalen hängen. Sie werden beim nächsten Lauf neu geprüft,
    alle anderen bleiben ohne neue KI-Kosten stehen. */
export async function invalidateChanged(
  p: Profile, oldVals: string, resolve: (key: string) => MatchTarget | null,
): Promise<{ stored: number; removed: string[] }> {
  const changed = changedFeatures(oldVals, profileValues(p));
  if (!changed.size) return { stored: 0, removed: [] };
  const store = storeKey(p);
  const all = (await redis().hgetall<Record<string, MatchResult>>(store)) ?? {};
  const removed = Object.entries(all).filter(([k, r]) => {
    const t = resolve(k);
    if (!t) return true;
    return !stillValid(r, changed, scopeForTarget(t), (id) => featureValue(p, id) === true);
  }).map(([k]) => k);
  if (removed.length) await redis().hdel(store, ...removed);
  await redis().del(failKey(p)).catch(() => 0);
  return { stored: Object.keys(all).length, removed };
}

/* ---------- Vom Nutzer gesetzter Status ---------- */

export interface Override { status: Status; at: string; notiz?: string }

export async function setOverride(p: Profile, key: string, status: Status | null, notiz?: string): Promise<void> {
  if (status === null) await redis().hdel(overrideKey(p), key);
  else {
    const o: Override = { status, at: new Date().toISOString(), ...(notiz ? { notiz } : {}) };
    await redis().hset(overrideKey(p), { [key]: o });
    await redis().expire(overrideKey(p), STORE_TTL);
  }
}

function fromOverride(o: Override, auto: MatchResult | null | undefined): MatchResult {
  return {
    status: o.status,
    grund: o.notiz ? `Von Ihnen festgelegt: ${o.notiz}` : "Status von Ihnen festgelegt.",
    notiz: o.notiz,
    stufe: "nutzer",
    auto: auto && auto.stufe !== "fallback" && auto.stufe !== "nutzer" ? { status: auto.status, grund: auto.grund } : undefined,
    art: auto?.art,
    kostenUsd: 0,
    at: o.at,
  };
}

const pendingResult = (scope: Scope | undefined, frage?: { merkmal: string; frage: string }): MatchResult => ({
  status: "unsicher", grund: "Noch nicht geprüft.", art: scope?.art, frage, stufe: "fallback", kostenUsd: 0,
  at: new Date().toISOString(),
});

/* ---------- Ersatzeinschätzung ohne KI ---------- */

/* Institutsart → Zielgruppen der Rahmenwerke (Framework.ents). */
const ENT_FEATURES: Record<string, string[]> = {
  CI: ["ki", "ki_crr", "bausparkasse", "foerderbank", "finanzholding"],
  IF: ["wpi", "wpi_gross", "wpi_mittel", "wpi_klein"],
  AM: ["kvg_ogaw", "kvg_aif", "kvg_registriert", "verwahrstelle"],
  PI: ["zi", "egi"],
  INS: ["versicherer_leben", "versicherer_kranken", "versicherer_schaden", "rueckversicherer", "pensionsfonds",
    "pensionskasse", "versicherungsholding"],
  OTH: ["fdi", "leasing_factoring", "casp", "krypto_emittent", "handelsplatz", "zentralverwahrer", "ccp", "datenbereitstellung"],
};
const ENT_LABEL: Record<string, string> = {
  CI: "Kreditinstitute", IF: "Wertpapierinstitute", AM: "Kapitalverwaltungsgesellschaften", PI: "Zahlungs- und E-Geld-Institute",
  INS: "Versicherer", OTH: "weitere Institute",
};
const VORLAEUFIG = "Vorläufige Einschätzung, die genaue Prüfung folgt";

/** Ist die KI nicht erreichbar (Guthaben, Budget, Störung), bekommt der
    Nutzer trotzdem eine brauchbare Einschätzung: aus der Anforderungsanalyse,
    wo es eine gibt, sonst aus Zielgruppe und Rechtsraum des Rahmenwerks.
    Sie wird nicht gespeichert; sobald die KI wieder antwortet, ersetzt die
    richtige Prüfung sie (Nutzerentscheidung 11.11.2026). */
export function offlineEstimate(p: Profile, t: MatchTarget, scope: Scope | undefined, rules: RuleResult): MatchResult {
  const base = { art: scope?.art, stufe: "vorlaeufig" as const, kostenUsd: 0, at: new Date().toISOString() };
  const out = (status: Status, grund: string, extra: Partial<MatchResult> = {}): MatchResult =>
    ({ ...base, status, grund: `${VORLAEUFIG}: ${grund}`, ...extra });
  if (scope) {
    if (rules.hits.length) {
      const partial = scope.teilregeln.length > 0 || scope.schwellen.length > 0;
      return out(partial ? "teilweise" : "ja", `Adressat, weil ${rules.hits[0].alle.map(featureLabel).join(" + ")}.`,
        partial ? { teile: "Welche Teile gelten, klärt die genaue Prüfung." } : {});
    }
    const frage = fallbackQuestion(p, scope, rules);
    return out("unsicher", "Die Angaben im Profil reichen ohne genaue Prüfung nicht aus.", { frage });
  }
  const { fw } = t;
  if ((fw.jur === "DE" && featureValue(p, "taetig_de") === false) || (fw.jur === "LU" && (featureValue(p, "sitz_lu") === false || featureValue(p, "sitz_de") === true))) {
    return out("nein", `Das Rahmenwerk „${fw.n.de}“ gilt nur in ${fw.jur === "DE" ? "Deutschland" : "Luxemburg"}.`);
  }
  const mine = Object.keys(ENT_FEATURES).filter((e) => ENT_FEATURES[e].some((f) => featureValue(p, f) === true));
  if (!mine.length) return out("unsicher", "Die Institutsart ist im Profil nicht angegeben.");
  const hit = mine.find((e) => fw.ents.includes(e));
  if (hit) return out("ja", `Das Rahmenwerk „${fw.n.de}“ richtet sich an ${ENT_LABEL[hit]}.`);
  return out("nein", `Das Rahmenwerk „${fw.n.de}“ richtet sich nur an ${fw.ents.map((e) => ENT_LABEL[e] ?? e).join(", ")}.`);
}

/* Seit 11.11.2026 läuft je Profil keine KI mehr (Nutzerentscheidung, Kosten):
   Die Regeln entscheiden anhand der Anforderungsanalyse; Ziele, deren Analyse
   noch fehlt, bekommen bis dahin die vorläufige Einschätzung. Mit
   RELEVANCE_LLM=1 prüft für solche Ziele wieder die KI. */
const LLM_ENABLED = process.env.RELEVANCE_LLM === "1";

/** Regel-Entscheidung für ein Ziel, falls die Analyse sie hergibt. */
export function ruleFor(p: Profile, t: MatchTarget): MatchResult | undefined {
  return ruleCheck(p, scopeForTarget(t)).decided;
}

async function computeOne(p: Profile, t: MatchTarget, opts: { noLlm?: boolean; persist: boolean }): Promise<MatchResult> {
  const scope = scopeForTarget(t);
  const rules = ruleCheck(p, scope);
  if (rules.decided) return rules.decided;
  if (!LLM_ENABLED) return offlineEstimate(p, t, scope, rules);
  const key = cacheKey(t, profileSignature(p));
  try {
    const hit = await redis().get<MatchResult>(key);
    if (hit && !answered(p, hit)) return hit;
  } catch { /* ohne Cache weiter */ }
  const extra = (main?: { merkmal: string }) =>
    (scope?.fragen ?? []).filter((f) => askable(p, f.merkmal) && f.merkmal !== main?.merkmal).slice(0, 3);
  if (opts.noLlm) {
    const frage = fallbackQuestion(p, scope, rules);
    return { ...pendingResult(scope, frage), weitere: extra(frage) };
  }
  // Sperre je Paar: Komplettlauf und Seitenaufruf prüfen nie dasselbe Paar
  // gleichzeitig (sonst doppelte KI-Kosten). Wer die Sperre nicht bekommt,
  // meldet „Noch nicht geprüft“; der Browser fragt kurz darauf nach.
  if (opts.persist) {
    const got = await redis().set(lockKey(p, t.key), 1, { nx: true, ex: 180 }).catch(() => "OK");
    if (got !== "OK") return pendingResult(scope);
  }
  let result: MatchResult;
  try {
    result = await llmMatch(p, t, scope, rules);
  } catch (e) {
    console.error("relevance llm failed:", t.key, e instanceof Error ? e.message : e);
    const budget = e instanceof BudgetError;
    if (budget) {
      if (opts.persist) await redis().del(lockKey(p, t.key)).catch(() => 0);
      return offlineEstimate(p, t, scope, rules);
    }
    const frage = fallbackQuestion(p, scope, rules);
    // API-Fehler zählen je Paar; nach MAX_FAILS bleibt es dauerhaft bei
    // „Unklar“ (der Nutzer kann den Status selbst setzen). Budget-Stopps
    // zählen nicht, sie lösen sich im Folgemonat.
    let fails = 0;
    if (!budget && opts.persist) fails = await redis().hincrby(failKey(p), t.key, 1).catch(() => 0);
    const final = fails >= MAX_FAILS;
    result = {
      status: "unsicher",
      grund: budget ? "Prüfung derzeit ausgelastet, bitte später erneut ansehen."
        : final ? "Unklar, weil die automatische Prüfung wiederholt nicht möglich war." : "Prüfung derzeit nicht verfügbar.",
      frage, weitere: extra(frage), merkmale: frage ? [frage.merkmal] : [], art: scope?.art,
      stufe: final ? "ki" : "fallback", kostenUsd: 0, at: new Date().toISOString(),
    };
    if (opts.persist) await redis().del(lockKey(p, t.key)).catch(() => 0);
    return result;
  }
  if (result.status === "unsicher") result.weitere = extra(result.frage);
  try { await redis().set(key, result, { ex: TTL }); } catch { /* egal */ }
  return result;
}

/** Mehrere Ziele mit begrenzter Parallelität. Bereits geprüfte Paare kommen
    aus dem Profil-Speicher und kosten nichts; vom Nutzer gesetzte Status
    gehen vor und lösen gar keine Prüfung aus. `persist: false` für
    Browser-Entwürfe von Gästen (deren Merkmale sich ständig ändern): dann
    nur Signatur-Cache. */
export async function matchMany(
  p: Profile,
  targets: MatchTarget[],
  opts: { concurrency?: number; noLlm?: boolean; deadlineMs?: number; persist?: boolean } = {},
): Promise<Record<string, MatchResult>> {
  const out: Record<string, MatchResult> = {};
  if (!targets.length) return out;
  const persist = opts.persist !== false;
  const store = storeKey(p);
  const fields = targets.map((t) => t.key);
  let stored: Record<string, MatchResult | null> = {};
  let overrides: Record<string, Override | null> = {};
  if (persist) {
    try {
      [stored, overrides] = await Promise.all([
        redis().hmget<Record<string, MatchResult | null>>(store, ...fields).then((x) => x ?? {}),
        redis().hmget<Record<string, Override | null>>(overrideKey(p), ...fields).then((x) => x ?? {}),
      ]);
    } catch { /* ohne Speicher weiter */ }
  }
  // Regeln kosten nichts und folgen immer der aktuellen Analyse: Sie gehen
  // gespeicherten Ergebnissen vor (auch früheren KI-Urteilen) und werden nur
  // gespeichert, damit Listen und Export sie in einem Abruf bekommen.
  const fresh: Record<string, MatchResult> = {};
  const todo = targets.filter((t) => {
    const o = overrides[t.key];
    const r = stored[t.key];
    const rule = ruleFor(p, t);
    if (rule) {
      if (!r || r.status !== rule.status || r.grund !== rule.grund || r.teile !== rule.teile) fresh[t.key] = rule;
      out[t.key] = o ? fromOverride(o, rule) : rule;
      return false;
    }
    if (o) { out[t.key] = fromOverride(o, r); return false; }
    if (r && !answered(p, r)) { out[t.key] = r; return false; }
    return true;
  });
  const save = async () => {
    if (!persist || !Object.keys(fresh).length) return;
    try {
      await redis().hset(store, fresh);
      await redis().expire(store, STORE_TTL);
    } catch { /* egal */ }
  };
  if (!todo.length) { await save(); return out; }

  const queue = [...todo];
  const stopAt = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const r = await computeOne(p, t, { noLlm: opts.noLlm || Date.now() > stopAt, persist });
      out[t.key] = r;
      if (r.stufe !== "fallback" && r.stufe !== "vorlaeufig") fresh[t.key] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, todo.length) }, worker));
  await save();
  return out;
}

/** Alles, was für das Profil festgehalten ist (gespeicherte Prüfungen und
    selbst gesetzte Status), in einem Abruf. Ergebnisse, deren Rückfrage das
    Profil inzwischen beantwortet, fehlen (sie werden neu geprüft). */
export async function storedAll(p: Profile, resolve?: (key: string) => MatchTarget | null): Promise<Record<string, MatchResult>> {
  const [stored, overrides] = await Promise.all([
    redis().hgetall<Record<string, MatchResult>>(storeKey(p)).then((x) => x ?? {}),
    redis().hgetall<Record<string, Override>>(overrideKey(p)).then((x) => x ?? {}),
  ]);
  const out: Record<string, MatchResult> = {};
  for (const [k, r] of Object.entries(stored)) {
    // Gespeicherte Stände folgen der aktuellen Analyse (Regeln sind gratis).
    const t = resolve?.(k);
    const rule = t ? ruleFor(p, t) : undefined;
    if (rule) { out[k] = rule; stored[k] = rule; } else if (r && !answered(p, r)) out[k] = r;
  }
  for (const [k, o] of Object.entries(overrides)) if (o) out[k] = fromOverride(o, stored[k]);
  return out;
}

/** Wie viele der Ziele sind für das Profil schon gespeichert? */
export async function storedCount(p: Profile, keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const got = (await redis().hmget<Record<string, MatchResult | null>>(storeKey(p), ...keys)) ?? {};
  return Object.values(got).filter(Boolean).length;
}

export const STATUS_LABEL: Record<Status, string> = {
  ja: "Einschlägig",
  teilweise: "Teilweise einschlägig",
  nein: "Nicht einschlägig",
  unsicher: "Unklar",
};

export { featureById };
