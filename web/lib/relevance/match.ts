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
import { scopeFor, SCOPE_FORMAT, type Group, type Scope } from "./scopes";
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
  stufe: "regel" | "ki" | "schiedsrichter" | "fallback" | "nutzer";
  /** Bei stufe "nutzer": die automatische Einschätzung, falls vorhanden. */
  auto?: { status: Status; grund: string };
  kostenUsd: number;
  at: string;
}

export interface MatchTarget { key: string; fw: Framework; u?: Update }

const MATCH_VERSION = 2; // 2: neue Modelle (07.11.2026)
const TTL = 60 * 60 * 24 * 180;

/* ---------- Regel-Vorfilter ---------- */

type GroupEval = { v: Tri; unknown: string[] };

function evalGroup(p: Profile, g: Group): GroupEval {
  const unknown: string[] = [];
  for (const id of g.alle) {
    const v = featureValue(p, id);
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
  const hits = evals.filter((x) => x.e.v === true).map((x) => x.g);
  const open = evals.filter((x) => x.e.v === null).map((x) => x.e);
  const allFalse = evals.length > 0 && evals.every((x) => x.e.v === false);
  // Konsolidierte Pflichten treffen auch Finanzholdings und übergeordnete
  // Unternehmen, selbst wenn die Analyse nur die Institutsart nennt
  // (Beispiel GRENKE AG: Leasing-Erlaubnis, aber Finanzholding über einer
  // CRR-Bank). Dann entscheidet nicht die Regel, sondern die KI.
  const consolidated = scope.ebene !== "einzel"
    && (featureValue(p, "finanzholding") === true || featureValue(p, "gruppe_uebergeordnet") === true);
  if (allFalse && !consolidated) {
    return {
      decided: { ...base, status: "nein", grund: `Nicht einschlägig, weil es sich nur richtet an: ${(scope.kurz || scope.adressaten.map((g) => g.alle.map(featureLabel).join(" + ")).join("; ")).replace(/\.+$/, "")}.` },
      hits, open, allFalse,
    };
  }
  // Regel-„ja“ nur für Pflichten (geltend oder künftig); Hinweise und
  // Berichte prüft die KI, ob sie wirklich einen Prüfanlass geben.
  if (hits.length > 0 && scope.teilregeln.length === 0 && scope.schwellen.length === 0
    && (scope.art === "pflicht" || scope.art === "kuenftig")) {
    return {
      decided: { ...base, status: "ja", grund: `Einschlägig, weil ${hits[0].alle.map(featureLabel).join(" + ")}.`, merkmale: hits[0].alle },
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

function fallbackQuestion(p: Profile, scope: Scope | undefined, rules: RuleResult) {
  const fromScope = scope?.fragen.find((f) => featureValue(p, f.merkmal) === null);
  if (fromScope) return fromScope;
  const id = rules.open[0]?.unknown[0];
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
  if (r.stufe === "fallback") return false;
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
    return !stillValid(r, changed, t.u?.url ? scopeFor(t.u.url) : undefined, (id) => featureValue(p, id) === true);
  }).map(([k]) => k);
  if (removed.length) await redis().hdel(store, ...removed);
  await redis().del(failKey(p)).catch(() => 0);
  return { stored: Object.keys(all).length, removed };
}

/* ---------- Vom Nutzer gesetzter Status ---------- */

export interface Override { status: Status; at: string }

export async function setOverride(p: Profile, key: string, status: Status | null): Promise<void> {
  if (status === null) await redis().hdel(overrideKey(p), key);
  else {
    await redis().hset(overrideKey(p), { [key]: { status, at: new Date().toISOString() } satisfies Override });
    await redis().expire(overrideKey(p), STORE_TTL);
  }
}

function fromOverride(o: Override, auto: MatchResult | null | undefined): MatchResult {
  return {
    status: o.status,
    grund: "Status von Ihnen festgelegt.",
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

async function computeOne(p: Profile, t: MatchTarget, opts: { noLlm?: boolean; persist: boolean }): Promise<MatchResult> {
  const scope = t.u?.url ? scopeFor(t.u.url) : undefined;
  const rules = ruleCheck(p, scope);
  if (rules.decided) return rules.decided;
  const key = cacheKey(t, profileSignature(p));
  try {
    const hit = await redis().get<MatchResult>(key);
    if (hit && !answered(p, hit)) return hit;
  } catch { /* ohne Cache weiter */ }
  const extra = (main?: { merkmal: string }) =>
    (scope?.fragen ?? []).filter((f) => featureValue(p, f.merkmal) === null && f.merkmal !== main?.merkmal).slice(0, 3);
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
    const frage = fallbackQuestion(p, scope, rules);
    const budget = e instanceof BudgetError;
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
  const todo = targets.filter((t) => {
    const o = overrides[t.key];
    if (o) { out[t.key] = fromOverride(o, stored[t.key]); return false; }
    const r = stored[t.key];
    if (r && !answered(p, r)) { out[t.key] = r; return false; }
    return true;
  });
  if (!todo.length) return out;

  const fresh: Record<string, MatchResult> = {};
  const queue = [...todo];
  const stopAt = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const r = await computeOne(p, t, { noLlm: opts.noLlm || Date.now() > stopAt, persist });
      out[t.key] = r;
      if (r.stufe !== "fallback") fresh[t.key] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, todo.length) }, worker));
  if (persist && Object.keys(fresh).length) {
    try {
      await redis().hset(store, fresh);
      await redis().expire(store, STORE_TTL);
    } catch { /* egal */ }
  }
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
