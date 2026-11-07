"use client";

// Client-Seite der Einschlägigkeit: Besucherstatus (/api/me), Profil-Entwurf
// im Browser (Gäste, bis zur Registrierung) und gebündelte Prüfabfragen.
// Keine Server-Importe, damit Seiten-Bundles klein bleiben.

import { useEffect, useState } from "react";

export type Status = "ja" | "teilweise" | "nein" | "unsicher";
export interface MatchResult {
  status: Status;
  grund: string;
  teile?: string;
  frage?: { merkmal: string; frage: string };
  art?: "pflicht" | "kuenftig" | "information" | "keine_institute";
  stufe: string;
}
export interface ProfileRef { id: string; name: string; origin: string }
export interface Me {
  loggedIn: boolean;
  email: string | null;
  profiles: ProfileRef[];
  activeId: string | null;
  primaryId?: string | null;
  pre: { name: string | null; domain: string; kind: string; profile?: unknown } | null;
  subscriber?: boolean;
}

export const STATUS_LABEL: Record<Status, string> = {
  ja: "Einschlägig",
  teilweise: "Teilweise einschlägig",
  nein: "Nicht einschlägig",
  unsicher: "Unklar",
};

export const statusPill = (s: Status) =>
  `inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
    s === "ja"
      ? "bg-slate-900 text-white"
      : s === "teilweise"
        ? "border border-slate-900 text-slate-900"
        : s === "nein"
          ? "border border-slate-200 text-slate-400"
          : "border border-dashed border-slate-400 text-slate-600"
  }`;

const DRAFT_KEY = "rr.profileDraft";
const EVENT = "rr:profile";
/** Teilergebnisse eingetroffen: nur Anzeige auffrischen, nichts neu laden. */
const PARTIAL = "rr:partial";
const PENDING: MatchResult = { status: "unsicher", grund: "Noch nicht geprüft.", stufe: "fallback" };

export function readDraft(): { id: string; name: string } & Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeDraft(p: unknown | null): void {
  try {
    if (p) localStorage.setItem(DRAFT_KEY, JSON.stringify(p));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* privat-Modus */ }
  invalidate();
}

let mePromise: Promise<Me> | null = null;
const results = new Map<string, MatchResult>();

export function invalidate(): void {
  mePromise = null;
  results.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function loadMe(): Promise<Me> {
  if (!mePromise) {
    mePromise = fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<Me>)
      .catch(() => ({ loggedIn: false, email: null, profiles: [], activeId: null, pre: null }));
  }
  return mePromise;
}

/** Hat der Besucher irgendein Profil (Konto, Entwurf, Domain-Vorprofil)? */
export function hasProfile(me: Me | null): boolean {
  return !!me && (me.profiles.length > 0 || !!readDraft() || !!me.pre?.name);
}

export function activeName(me: Me | null): string | null {
  if (!me) return null;
  if (me.loggedIn) return me.profiles.find((p) => p.id === me.activeId)?.name ?? me.profiles[0]?.name ?? null;
  return (readDraft()?.name as string | undefined) ?? me.pre?.name ?? null;
}

/* Gebündelte Prüfabfragen: Aufrufe innerhalb von 30 ms gehen in einen Request. */
let pending: { keys: Set<string>; waiters: (() => void)[] } | null = null;
const inflight = new Set<string>();

async function flush(batch: { keys: Set<string>; waiters: (() => void)[] }) {
  const keys = [...batch.keys];
  keys.forEach((k) => inflight.add(k));
  // Pakete zu 20 parallel: erste Ergebnisse kommen schneller als bei einem
  // großen Paket, das bis zum Zeitlimit des Servers läuft.
  const me = await loadMe();
  const draft = me.loggedIn ? undefined : readDraft() ?? undefined;
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 20) chunks.push(keys.slice(i, i + 20));
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const res = await fetch("/api/relevance/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: chunk, profile: draft }),
      });
      const json = (await res.json()) as { results?: Record<string, MatchResult> };
      for (const [k, v] of Object.entries(json.results ?? {})) results.set(k, v);
      if (typeof window !== "undefined") window.dispatchEvent(new Event(PARTIAL));
    } catch { /* still: keine Chips */ }
  }));
  keys.forEach((k) => inflight.delete(k));
  batch.waiters.forEach((w) => w());
  scheduleRetry(keys);
}

/* Was der Server in seiner Zeit nicht geschafft hat („Noch nicht geprüft“),
   fragen wir nach kurzer Pause erneut an; fertige Ergebnisse liegen dann im
   Server-Cache, der Rest wird weitergeprüft. Höchstens 8 Runden je Schlüssel. */
const retries = new Map<string, number>();
export const isPending = (r?: MatchResult) => !!r && r.stufe === "fallback" && r.grund.startsWith("Noch nicht geprüft");
const isOutage = (r?: MatchResult) => !!r && r.grund.startsWith("Prüfung derzeit nicht verfügbar");

function scheduleRetry(keys: string[]) {
  const again = keys.filter((k) => {
    const r = results.get(k);
    const n = retries.get(k) ?? 0;
    return (isPending(r) && n < 8) || (isOutage(r) && n < 2);
  });
  if (!again.length || typeof window === "undefined") return;
  again.forEach((k) => retries.set(k, (retries.get(k) ?? 0) + 1));
  setTimeout(() => {
    again.forEach((k) => results.delete(k));
    window.dispatchEvent(new Event(EVENT));
  }, 1500);
}

export function check(keys: string[]): Promise<void> {
  const missing = keys.filter((k) => !results.has(k) && !inflight.has(k));
  if (!missing.length) return Promise.resolve();
  if (!pending) {
    pending = { keys: new Set(), waiters: [] };
    const b = pending;
    setTimeout(() => {
      pending = null;
      void flush(b);
    }, 30);
  }
  missing.forEach((k) => pending!.keys.add(k));
  return new Promise((resolve) => pending!.waiters.push(resolve));
}

export const resultFor = (key: string) => results.get(key);

/** React-Hook: Besucherstatus, aktualisiert bei Profilwechsel. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => loadMe().then((m) => alive && setMe(m));
    load();
    window.addEventListener(EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, load);
    };
  }, []);
  return me;
}

/** React-Hook: Ergebnisse für mehrere Schlüssel ("u:<slug>", "f:<id>"). */
export function useRelevance(keys: string[], enabled: boolean): Record<string, MatchResult> {
  const [out, setOut] = useState<Record<string, MatchResult>>({});
  const sig = keys.join("|");
  useEffect(() => {
    if (!enabled || !keys.length) return;
    let alive = true;
    // Bis ein Ergebnis da ist, steht der Schlüssel auf „wird geprüft“.
    const show = () => {
      if (!alive) return;
      const o: Record<string, MatchResult> = {};
      for (const k of keys) o[k] = results.get(k) ?? PENDING;
      setOut(o);
    };
    const run = () => {
      show();
      void check(keys).then(show);
    };
    run();
    window.addEventListener(EVENT, run);
    window.addEventListener(PARTIAL, show);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, run);
      window.removeEventListener(PARTIAL, show);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled]);
  return out;
}
