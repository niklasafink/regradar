"use client";

// Client-Seite der Einschlägigkeit: Besucherstatus (/api/me), Profil-Entwurf
// im Browser (Gäste, bis zur Registrierung; Einschätzungen gibt es erst nach
// der Anmeldung) und gebündelte Prüfabfragen.
// Keine Server-Importe, damit Seiten-Bundles klein bleiben.

import { useEffect, useState } from "react";

export type Status = "ja" | "teilweise" | "nein" | "unsicher";
export interface MatchResult {
  status: Status;
  grund: string;
  teile?: string;
  frage?: { merkmal: string; frage: string };
  weitere?: { merkmal: string; frage: string }[];
  art?: "pflicht" | "kuenftig" | "information" | "keine_institute";
  stufe: string;
  /** Bei stufe "nutzer": die automatische Einschätzung. */
  auto?: { status: Status; grund: string };
  /** Bei stufe "nutzer": Begründung des Nutzers. */
  notiz?: string;
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

/* Angemeldet: alles, was für das aktive Profil gespeichert ist, kommt in
   einem Abruf (/api/relevance/stored). Die Listen zeigen damit sofort den
   gespeicherten Stand; nur was dort fehlt, wird einzeln nachgefragt. */
let storedPromise: Promise<void> | null = null;

function loadStored(): Promise<void> {
  if (!storedPromise) {
    storedPromise = loadMe().then(async (me) => {
      if (!me.loggedIn || !me.profiles.length) return;
      try {
        const at = epoch;
        const res = await fetch("/api/relevance/stored", { cache: "no-store" });
        const json = (await res.json()) as { results?: Record<string, MatchResult> };
        if (at !== epoch) return;
        for (const [k, v] of Object.entries(json.results ?? {})) if (!results.has(k)) results.set(k, v);
      } catch { /* dann paketweise wie bisher */ }
    });
  }
  return storedPromise;
}

/* Zählt Profilwechsel und -änderungen. Antworten, die vor dem Wechsel
   angefragt wurden, gehören zum alten Profil und dürfen nicht mehr in die
   Anzeige (Befund 11.11.2026: nach dem Wechsel standen kurz Status des
   vorherigen Instituts in der Liste). */
let epoch = 0;

export function invalidate(): void {
  epoch++;
  mePromise = null;
  storedPromise = null;
  results.clear();
  cheapMiss.clear();
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

/** Rückfrage beantworten: Antwort ins Profil (Konto oder Browser-Entwurf);
    danach prüft der Server nur die Fälle neu, die an dieser Frage hingen. */
export async function answerQuestion(me: Me, merkmal: string, value: boolean): Promise<void> {
  const answers = { [merkmal]: value };
  if (me.loggedIn) {
    await fetch("/api/account/answer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }),
    });
    invalidate();
    return;
  }
  const base = readDraft() ?? (me.pre as { profile?: unknown } | null)?.profile;
  if (!base) return;
  const res = await fetch("/api/relevance/answers", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: base, answers }),
  });
  const json = (await res.json()) as { profile?: unknown };
  if (json.profile) writeDraft(json.profile);
}

/** Status selbst festlegen (nur Konten), optional mit Begründung;
    null = automatische Einschätzung. */
export async function setStatus(key: string, status: Status | null, notiz?: string): Promise<void> {
  const res = await fetch("/api/relevance/override", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, status, notiz }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Fehler");
  results.delete(key);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Zeigt die Seite Einschätzungen? Nur angemeldet und mit Kontoprofil
    (Nutzerentscheidung 11.11.2026: keine Analyse ohne bekannte E-Mail). */
export function hasProfile(me: Me | null): boolean {
  return !!me && me.loggedIn && me.profiles.length > 0;
}

/** Gast mit vorbereitetem Profil (Browser-Entwurf oder Vorprofil der
    Domain): sieht keine Einschätzung, sondern die Bitte, sich anzumelden. */
export function hasDraftOnly(me: Me | null): boolean {
  return !!me && !me.loggedIn && (!!readDraft() || !!me.pre?.name);
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
  if (!me.loggedIn) {
    keys.forEach((k) => inflight.delete(k));
    batch.waiters.forEach((w) => w());
    return;
  }
  const draft = undefined;
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 20) chunks.push(keys.slice(i, i + 20));
  const at = epoch;
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const res = await fetch("/api/relevance/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: chunk, profile: draft }),
      });
      const json = (await res.json()) as { results?: Record<string, MatchResult> };
      if (at !== epoch) return;
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

export async function check(keys: string[]): Promise<void> {
  await loadStored();
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

/* Günstige Abfrage ohne KI (nur Regeln und gespeicherte Ergebnisse) für
   Einträge jenseits der vollen Prüfung, damit der Filter die ganze Liste
   abdeckt, ohne Kosten auszulösen. Nicht entschiedene Schlüssel merken wir
   uns, damit sie nicht erneut abgefragt werden; die volle Prüfung bleibt
   für sie offen (Detailseite, erste Einträge der Liste). */
const cheapMiss = new Set<string>();
const cheapInflight = new Set<string>();

async function checkCheap(keys: string[]): Promise<void> {
  await loadStored();
  const missing = keys.filter((k) => !results.has(k) && !cheapMiss.has(k) && !cheapInflight.has(k) && !inflight.has(k));
  if (!missing.length) return;
  missing.forEach((k) => cheapInflight.add(k));
  const me = await loadMe();
  if (!me.loggedIn) {
    missing.forEach((k) => cheapInflight.delete(k));
    return;
  }
  const draft = undefined;
  const queue: string[][] = [];
  for (let i = 0; i < missing.length; i += 40) queue.push(missing.slice(i, i + 40));
  const at = epoch;
  const worker = async () => {
    for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
      try {
        const res = await fetch("/api/relevance/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: chunk, profile: draft, noLlm: true }),
        });
        const json = (await res.json()) as { results?: Record<string, MatchResult> };
        if (at !== epoch) return;
        for (const k of chunk) {
          const v = json.results?.[k];
          if (v && v.stufe !== "fallback" && v.stufe !== "vorlaeufig") results.set(k, v);
          else cheapMiss.add(k);
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event(PARTIAL));
      } catch { /* still */ }
      chunk.forEach((k) => cheapInflight.delete(k));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

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

/** React-Hook: Ergebnisse für mehrere Schlüssel ("u:<slug>", "f:<id>").
    `cheap`: weitere Schlüssel, die nur ohne KI abgefragt werden (für den
    Filter); ohne Ergebnis fehlen sie in der Rückgabe. */
export function useRelevance(keys: string[], enabled: boolean, cheap: string[] = []): Record<string, MatchResult> {
  const [out, setOut] = useState<Record<string, MatchResult>>({});
  const sig = keys.join("|") + "#" + cheap.join("|");
  useEffect(() => {
    if (!enabled || (!keys.length && !cheap.length)) return;
    let alive = true;
    // Bis ein Ergebnis da ist, steht der Schlüssel auf „wird geprüft“.
    const show = () => {
      if (!alive) return;
      const o: Record<string, MatchResult> = {};
      for (const k of keys) o[k] = results.get(k) ?? PENDING;
      for (const k of cheap) {
        const r = results.get(k);
        if (r && !(k in o)) o[k] = r;
      }
      setOut(o);
    };
    const run = () => {
      show();
      void check(keys).then(show);
      if (cheap.length) void checkCheap(cheap.filter((k) => !keys.includes(k))).then(show);
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

/* ---------- Filter nach Einschlägigkeit ---------- */

export type RelFilter = "alle" | Status;
const FILTER_KEY = "rr.relFilter";
const FILTER_EVENT = "rr:relfilter";

/** Auswahl gilt seitenübergreifend für die Sitzung. */
export function useRelFilter(): [RelFilter, (f: RelFilter) => void] {
  const [f, setF] = useState<RelFilter>("alle");
  useEffect(() => {
    const read = () => {
      try {
        const v = sessionStorage.getItem(FILTER_KEY) as RelFilter | null;
        setF(v && (v === "alle" || v in STATUS_LABEL) ? v : "alle");
      } catch { /* privat-Modus */ }
    };
    read();
    window.addEventListener(FILTER_EVENT, read);
    return () => window.removeEventListener(FILTER_EVENT, read);
  }, []);
  const set = (v: RelFilter) => {
    setF(v);
    try { sessionStorage.setItem(FILTER_KEY, v); } catch { /* privat-Modus */ }
    window.dispatchEvent(new Event(FILTER_EVENT));
  };
  return [f, set];
}

/** Passt ein Ergebnis zum Filter? Ungeprüfte Einträge erscheinen nur unter „Alle“. */
export function relMatches(f: RelFilter, r?: MatchResult): boolean {
  if (f === "alle") return true;
  if (!r || isPending(r)) return false;
  return r.status === f;
}
