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
// Ergebnisse werden je (Update, Profil-Signatur) in Redis gecacht: gleiche
// Profile teilen sich die Kosten. Server-only.

import { featureById, featureLabel, FEATURE_IDS, FEATURES } from "./catalog";
import { BudgetError, chatJson, MODELS } from "./llm";
import { featureValue, profileSignature, type Profile, type Tri } from "./profile";
import { scopeFor, SCOPE_FORMAT, type Group, type Scope } from "./scopes";
import { redis } from "../subscribers";
import type { Framework, Update } from "../data";

export type Status = "ja" | "teilweise" | "nein" | "unsicher";

export interface MatchResult {
  status: Status;
  grund: string;
  teile?: string;
  frage?: { merkmal: string; frage: string };
  art?: Scope["art"];
  stufe: "regel" | "ki" | "schiedsrichter" | "fallback";
  kostenUsd: number;
  at: string;
}

export interface MatchTarget { key: string; fw: Framework; u?: Update }

const MATCH_VERSION = 1;
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
      decided: { ...base, status: "nein", grund: "Richtet sich nicht unmittelbar an Institute (z. B. internationaler Standard oder Material für Behörden)." },
      hits: [], open: [], allFalse: true,
    };
  }
  const excluded = scope.ausschluesse.find((g) => evalGroup(p, g).v === true);
  if (excluded) {
    return {
      decided: { ...base, status: "nein", grund: `Ausdrücklich ausgenommen: ${excluded.alle.map(featureLabel).join(", ")}.` },
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
      decided: { ...base, status: "nein", grund: `Adressaten laut Analyse: ${(scope.kurz || scope.adressaten.map((g) => g.alle.map(featureLabel).join(" + ")).join("; ")).replace(/\.+$/, "")}. Das Profil erfüllt keine dieser Voraussetzungen.` },
      hits, open, allFalse,
    };
  }
  // Regel-„ja“ nur für Pflichten (geltend oder künftig); Hinweise und
  // Berichte prüft die KI, ob sie wirklich einen Prüfanlass geben.
  if (hits.length > 0 && scope.teilregeln.length === 0 && scope.schwellen.length === 0
    && (scope.art === "pflicht" || scope.art === "kuenftig")) {
    return {
      decided: { ...base, status: "ja", grund: `Einschlägig als ${hits[0].alle.map(featureLabel).join(" + ")}.${scope.handlung ? ` ${scope.handlung}` : ""}` },
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

Antworte nur als JSON: {"status": "ja|teilweise|nein|unsicher", "teile": "…" | null, "grund": "ein bis zwei Sätze, nenne die
entscheidenden Merkmale in Worten", "merkmale": ["IDs der Profilmerkmale, auf die du dich stützt"], "frage": {"merkmal": "id", "frage": "…"} | null}`;

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
    chatJson<LlmVerdict>({ model: MODELS.matchA, system: MATCH_SYSTEM, user, maxTokens: 2500 }),
    chatJson<LlmVerdict>({ model: MODELS.matchB, system: MATCH_SYSTEM, user, maxTokens: 2500 }),
  ]);
  // Fällt ein Prüfer aus (leere Antwort, API-Fehler), entscheidet der andere
  // allein, wenn sein Urteil die Regelprüfung besteht.
  if (sa.status === "rejected" || sb.status === "rejected") {
    const bad = [sa, sb].find((x) => x.status === "rejected") as PromiseRejectedResult;
    if (bad.reason instanceof BudgetError) throw bad.reason;
    const ok = [sa, sb].find((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ data: LlmVerdict; costUsd: number }> | undefined;
    if (!ok) throw bad.reason;
    const v = norm(ok.value.data);
    if (qs1(p, v, rules).length) throw new Error("Einzelurteil besteht die Regelprüfung nicht");
    return { status: v.status, grund: v.grund, teile: v.teile, frage: v.frage, art: scope?.art, stufe: "ki", kostenUsd: ok.value.costUsd, at };
  }
  const a = sa.value;
  const b = sb.value;
  cost += a.costUsd + b.costUsd;
  const va = norm(a.data);
  const vb = norm(b.data);
  const issuesA = qs1(p, va, rules);
  const issuesB = qs1(p, vb, rules);

  const agree = relevantSide(va.status) === relevantSide(vb.status)
    && (va.status !== "unsicher" || va.frage?.merkmal === vb.frage?.merkmal || !!va.frage);
  if (agree && issuesA.length === 0) {
    const status: Status = va.status === "teilweise" || vb.status === "teilweise"
      ? (va.status === "ja" && vb.status === "ja" ? "ja" : "teilweise")
      : va.status;
    return {
      status, grund: va.grund, teile: va.teile ?? vb.teile, frage: va.frage ?? vb.frage,
      art: scope?.art, stufe: "ki", kostenUsd: cost, at,
    };
  }
  if (agree && issuesB.length === 0) {
    return { status: vb.status, grund: vb.grund, teile: vb.teile, frage: vb.frage, art: scope?.art, stufe: "ki", kostenUsd: cost, at };
  }

  // Schiedsrichter: sieht beide Urteile und die QS-1-Befunde.
  try {
    const arb = await chatJson<LlmVerdict>({
      model: MODELS.arbiter,
      system: `${MATCH_SYSTEM}\n\nZwei Prüfer kamen zu unterschiedlichen oder fehlerhaften Ergebnissen. Prüfe beide gegen Profil und
Anforderungsanalyse und entscheide selbst. Befunde der Regelprüfung sind Fakten.`,
      user: `${user}\n\nPRÜFER A: ${JSON.stringify(va)}\nBefunde Regelprüfung A: ${JSON.stringify(issuesA)}\n\nPRÜFER B: ${JSON.stringify(vb)}\nBefunde Regelprüfung B: ${JSON.stringify(issuesB)}`,
      maxTokens: 2500,
    });
    cost += arb.costUsd;
    const vc = norm(arb.data);
    if (qs1(p, vc, rules).length === 0) {
      return { status: vc.status, grund: vc.grund, teile: vc.teile, frage: vc.frage, art: scope?.art, stufe: "schiedsrichter", kostenUsd: cost, at };
    }
  } catch (e) {
    if (e instanceof BudgetError) throw e;
    console.error("arbiter failed:", e);
  }
  const frage = va.frage ?? vb.frage ?? fallbackQuestion(p, scope, rules);
  return {
    status: "unsicher",
    grund: "Die Prüfung kam zu keinem eindeutigen Ergebnis.",
    frage, art: scope?.art, stufe: "fallback", kostenUsd: cost, at,
  };
}

function fallbackQuestion(p: Profile, scope: Scope | undefined, rules: RuleResult) {
  const fromScope = scope?.fragen.find((f) => featureValue(p, f.merkmal) === null);
  if (fromScope) return fromScope;
  const id = rules.open[0]?.unknown[0];
  return id ? { merkmal: id, frage: `Trifft auf Ihr Institut zu: ${featureLabel(id)}?` } : undefined;
}

/* ---------- Öffentliche API ---------- */

const cacheKey = (t: MatchTarget, sig: string) => `relm:${MATCH_VERSION}.${SCOPE_FORMAT}:${t.key}:${sig}`;

export async function matchOne(p: Profile, t: MatchTarget, opts: { noLlm?: boolean } = {}): Promise<MatchResult> {
  const sig = profileSignature(p);
  const key = cacheKey(t, sig);
  try {
    const hit = await redis().get<MatchResult>(key);
    if (hit) return hit;
  } catch { /* ohne Cache weiter */ }

  const scope = t.u?.url ? scopeFor(t.u.url) : undefined;
  const rules = ruleCheck(p, scope);
  let result: MatchResult | undefined = rules.decided;
  if (!result) {
    if (opts.noLlm) {
      return {
        status: "unsicher", grund: "Noch nicht geprüft.", art: scope?.art,
        frage: fallbackQuestion(p, scope, rules), stufe: "fallback", kostenUsd: 0, at: new Date().toISOString(),
      };
    }
    try {
      result = await llmMatch(p, t, scope, rules);
    } catch (e) {
      // Budget erreicht oder API-Fehler: nichts cachen, ehrlich „unsicher“.
      console.error("relevance llm failed:", t.key, e instanceof Error ? e.message : e);
      return {
        status: "unsicher",
        grund: e instanceof BudgetError ? "Prüfung derzeit ausgelastet, bitte später erneut ansehen." : "Prüfung derzeit nicht verfügbar.",
        frage: fallbackQuestion(p, scope, rules), art: scope?.art, stufe: "fallback", kostenUsd: 0,
        at: new Date().toISOString(),
      };
    }
  }
  if (result.stufe !== "fallback") {
    try { await redis().set(key, result, { ex: TTL }); } catch { /* egal */ }
  }
  return result;
}

/** Mehrere Ziele mit begrenzter Parallelität. */
export async function matchMany(
  p: Profile,
  targets: MatchTarget[],
  opts: { concurrency?: number; noLlm?: boolean; deadlineMs?: number } = {},
): Promise<Record<string, MatchResult>> {
  const out: Record<string, MatchResult> = {};
  const queue = [...targets];
  const stopAt = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      out[t.key] = await matchOne(p, t, { noLlm: opts.noLlm || Date.now() > stopAt });
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, targets.length) }, worker));
  return out;
}

export const STATUS_LABEL: Record<Status, string> = {
  ja: "Einschlägig",
  teilweise: "Teilweise einschlägig",
  nein: "Nicht einschlägig",
  unsicher: "Unklar",
};

export { featureById };
