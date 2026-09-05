// Typen und reine Helfer der Scraper-Überwachung — ohne Server-Abhängigkeiten,
// damit auch die Client-Komponente (/admin/health) sie importieren kann.
// Serverlogik (Redis, Mail, Auth) liegt in lib/health.ts.

export const STALE_MS = 24 * 60 * 60 * 1000;

export type StepName = "crawl" | "big4" | "dedup" | "export" | "push";
export const STEP_NAMES: StepName[] = ["crawl", "big4", "dedup", "export", "push"];
export const STEP_LABEL: Record<StepName, string> = {
  crawl: "Crawl aller Quellen",
  big4: "Big4-Kanzleiartikel",
  dedup: "Dubletten-Abgleich",
  export: "Web-Export (live.json)",
  push: "Commit, Push, Deploy",
};

export type SourceState = {
  id: string;
  name: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastDocumentAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
  docs: number;
  newLast7d: number;
  errorsLast7d: number;
};

export type HeartbeatState = {
  v: number;
  sentAt: string;
  receivedAt: string;
  host?: string;
  run?: {
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number;
    steps?: Partial<Record<StepName, string>>;
  };
  stepsLastOk: Partial<Record<StepName, string>>;
  sources: SourceState[];
  big4?: { firm: string; articles: number; lastFoundAt: string | null }[];
};

export type Problem = {
  /** "pipeline" | "step:<name>" | "source:<id>" */
  key: string;
  label: string;
  since: string | null;
  detail: string;
};

export type AlertRecord = { since: string; lastMailAt: string; label: string };

export type RepairStep = {
  at: string;
  title: string;
  status: "running" | "ok" | "failed" | "info";
  detail?: string;
};

export type RepairState = {
  source: string;
  label: string;
  status: "requested" | "running" | "done" | "failed";
  requestedAt: string;
  updatedAt: string;
  steps: RepairStep[];
  result?: string;
};

export function isStale(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  return Number.isNaN(t) || now - t > STALE_MS;
}

/** Bewertung: Was ist länger als einen Tag nicht erfolgreich gelaufen?
    Ohne jedes Lebenszeichen wird nichts gemeldet (System noch nicht
    eingerichtet); ist das letzte Lebenszeichen selbst zu alt, gilt nur die
    Pipeline als ausgefallen — die mitgelieferten Quellstände wären veraltet. */
export function evaluate(state: HeartbeatState | null, now = Date.now()): Problem[] {
  if (!state) return [];
  if (isStale(state.receivedAt, now)) {
    return [
      {
        key: "pipeline",
        label: "Stundenlauf (Mac / launchd)",
        since: state.receivedAt,
        detail: "Kein Lebenszeichen mehr vom Rechner: Der stündliche Lauf ist nicht mehr angekommen.",
      },
    ];
  }
  const problems: Problem[] = [];
  for (const step of STEP_NAMES) {
    const last = state.stepsLastOk?.[step] ?? null;
    if (isStale(last, now)) {
      const lastStatus = state.run?.steps?.[step];
      problems.push({
        key: `step:${step}`,
        label: STEP_LABEL[step],
        since: last,
        detail: lastStatus ? `Letzter Lauf: ${lastStatus}` : "Noch nie erfolgreich",
      });
    }
  }
  for (const s of state.sources ?? []) {
    if (!s.enabled) continue;
    if (isStale(s.lastSuccessAt, now)) {
      problems.push({
        key: `source:${s.id}`,
        label: s.name,
        since: s.lastSuccessAt,
        detail: s.lastError ?? (s.lastRunStatus ? `Letzter Lauf: ${s.lastRunStatus}` : "Noch nie erfolgreich"),
      });
    }
  }
  return problems;
}

/** Ziel eines Reparaturauftrags für ein Problem: Quelle oder die ganze Pipeline. */
export function repairTargetFor(key: string): string {
  return key.startsWith("source:") ? key.slice("source:".length) : "pipeline";
}

export function fmtBerlin(iso: string | null | undefined): string {
  if (!iso) return "nie";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " Uhr";
}

