"use client";

// Live-Ansicht der Scraper-Überwachung: Lebenszeichen des Stundenlaufs,
// Pipeline-Schritte, alle Quellen mit letztem Erfolg, offene Probleme und der
// Verlauf einer laufenden Reparatur (Schritte des Agenten auf dem Mac).
// Pollt /api/health/repair?all=1 — alle 3 s während einer Reparatur, sonst
// alle 15 s.

import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/chrome";
import {
  STEP_LABEL,
  STEP_NAMES,
  fmtBerlin,
  isStale,
  repairTargetFor,
  type AlertRecord,
  type HeartbeatState,
  type Problem,
  type RepairState,
  type SourceState,
} from "@/lib/healthTypes";

type Payload = {
  now: string;
  state: HeartbeatState | null;
  problems: Problem[];
  alerts: Record<string, AlertRecord>;
  repairs: Record<string, RepairState>;
};

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "nie";
  const d = now - Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  const m = Math.round(d / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 48) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

function clock(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Pill({ tone, children }: { tone: "ok" | "bad" | "muted" | "live"; children: React.ReactNode }) {
  const cls =
    tone === "bad"
      ? "bg-red-600 text-white"
      : tone === "live"
        ? "bg-blue-600 text-white"
        : tone === "muted"
          ? "border border-slate-200 text-slate-500"
          : "bg-slate-900 text-white";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

const STEP_ICON: Record<string, string> = { running: "⏳", ok: "✓", failed: "✗", info: "·" };

function RepairPanel({ repair, now }: { repair: RepairState; now: number }) {
  const active = repair.status === "requested" || repair.status === "running";
  return (
    <section className="rounded-2xl border border-slate-900 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-medium tracking-tight text-slate-900">Reparatur: {repair.label}</h2>
        <Pill tone={active ? "live" : repair.status === "done" ? "ok" : "bad"}>
          {repair.status === "requested"
            ? "wartet auf den Rechner"
            : repair.status === "running"
              ? "läuft"
              : repair.status === "done"
                ? "behoben"
                : "nicht automatisch behebbar"}
        </Pill>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Auftrag {fmtBerlin(repair.requestedAt)}, letzte Meldung {ago(repair.updatedAt, now)}
        {active ? ", Seite aktualisiert sich von selbst" : ""}
      </p>
      <ol className="mt-4 space-y-3">
        {repair.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={`num mt-0.5 w-5 shrink-0 text-center text-sm ${
                s.status === "failed" ? "text-red-600" : s.status === "running" ? "text-blue-600" : "text-slate-900"
              }`}
            >
              {STEP_ICON[s.status] ?? "·"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`text-sm ${s.status === "failed" ? "text-red-600" : "text-slate-900"}`}>{s.title}</span>
                <span className="num text-xs text-slate-400">{clock(s.at)}</span>
              </div>
              {s.detail ? (
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-600">
                  {s.detail}
                </pre>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {repair.result ? (
        <p className={`mt-4 text-sm ${repair.status === "done" ? "text-slate-900" : "text-red-600"}`}>{repair.result}</p>
      ) : null}
    </section>
  );
}

function sourceTone(s: SourceState, now: number): { tone: "ok" | "bad" | "muted"; label: string } {
  if (!s.enabled) return { tone: "muted", label: "deaktiviert" };
  if (isStale(s.lastSuccessAt, now)) return { tone: "bad", label: "ausgefallen" };
  if (s.lastRunStatus === "ERROR") return { tone: "ok", label: "OK, letzter Lauf mit Fehler" };
  return { tone: "ok", label: "OK" };
}

export function Dashboard({ token, autoRepair }: { token: string; autoRepair: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [focus, setFocus] = useState<string | null>(autoRepair || null);
  const autoStarted = useRef(false);
  const api = `/api/health/repair?t=${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${api}&all=1`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as Payload);
      setError(null);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  const startRepair = useCallback(
    async (source: string) => {
      setFocus(source);
      try {
        const r = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error === "unknown_source" ? `Unbekannte Quelle: ${source}` : (j.error ?? `HTTP ${r.status}`));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await load();
    },
    [api, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoRepair && !autoStarted.current) {
      autoStarted.current = true;
      void startRepair(autoRepair);
    }
  }, [autoRepair, startRepair]);

  const repairActive = !!data && Object.values(data.repairs).some((r) => r.status === "requested" || r.status === "running");
  useEffect(() => {
    const id = setInterval(() => void load(), repairActive ? 3000 : 15000);
    return () => clearInterval(id);
  }, [load, repairActive]);

  const state = data?.state ?? null;
  const problems = data?.problems ?? [];
  const heartbeatStale = state ? isStale(state.receivedAt, now) : true;
  const focusRepair = focus ? data?.repairs[focus] : undefined;
  const otherRepairs = Object.values(data?.repairs ?? {})
    .filter((r) => r.source !== focus)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sources = [...(state?.sources ?? [])].sort((a, b) => {
    const sa = sourceTone(a, now).tone === "bad" ? 0 : a.enabled ? 1 : 2;
    const sb = sourceTone(b, now).tone === "bad" ? 0 : b.enabled ? 1 : 2;
    return sa - sb || a.name.localeCompare(b.name, "de");
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Wordmark className="text-xl" />
          <h1 className="font-heading mt-4 text-2xl font-medium tracking-tight text-slate-900 sm:text-3xl">Scraper-Status</h1>
          <p className="mt-1 text-sm text-slate-500">
            Letztes Lebenszeichen des Stundenlaufs:{" "}
            <span className={`num ${heartbeatStale ? "text-red-600" : "text-slate-900"}`}>
              {state ? `${ago(state.receivedAt, now)} (${fmtBerlin(state.receivedAt)})` : "noch keins empfangen"}
            </span>
            {state?.host ? <span className="text-slate-400"> auf {state.host}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {problems.length ? <Pill tone="bad">{problems.length === 1 ? "1 Problem" : `${problems.length} Probleme`}</Pill> : <Pill tone="ok">Alles läuft</Pill>}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-900"
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">Fehler: {error}</p> : null}

      {problems.length ? (
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Seit über einem Tag nicht erfolgreich</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {problems.map((p) => {
              const target = repairTargetFor(p.key);
              const r = data?.repairs[target];
              const busy = r && (r.status === "requested" || r.status === "running");
              return (
                <li key={p.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-red-600">{p.label}</span>
                    <span className="ml-2 text-xs text-slate-500">letzter Erfolg {fmtBerlin(p.since)}</span>
                    {p.detail ? <span className="mt-0.5 block truncate text-xs text-slate-400">{p.detail}</span> : null}
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void startRepair(target)}
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-default disabled:bg-slate-300"
                  >
                    {busy ? "Reparatur läuft" : target === "pipeline" ? "Pipeline reparieren" : "Reparieren"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {focusRepair ? (
        <div className="mt-8">
          <RepairPanel repair={focusRepair} now={now} />
        </div>
      ) : focus && data ? (
        <p className="mt-8 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-500">Reparaturauftrag für „{focus}“ wird angelegt …</p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Pipeline-Schritte des Stundenlaufs</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {STEP_NAMES.map((step) => {
            const last = state?.stepsLastOk?.[step] ?? null;
            const lastStatus = state?.run?.steps?.[step];
            const bad = state ? isStale(last, now) : false;
            return (
              <li key={step} className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-900">{STEP_LABEL[step]}</span>
                  <Pill tone={bad ? "bad" : lastStatus === "failed" ? "muted" : "ok"}>{bad ? "ausgefallen" : (lastStatus ?? "–")}</Pill>
                </div>
                <p className="num mt-1 text-xs text-slate-400">letzter Erfolg {ago(last, now)}</p>
              </li>
            );
          })}
        </ul>
        {state?.run ? (
          <p className="num mt-2 text-xs text-slate-400">
            Letzter Lauf: {fmtBerlin(state.run.startedAt)} bis {fmtBerlin(state.run.finishedAt)}, Exit-Code {state.run.exitCode ?? "?"}
          </p>
        ) : null}
        {problems.some((p) => p.key === "pipeline" || p.key.startsWith("step:")) ? null : state ? (
          <button
            type="button"
            onClick={() => void startRepair("pipeline")}
            className="mt-3 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-900"
          >
            Stundenlauf jetzt nachholen
          </button>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Quellen ({sources.length})</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">Quelle</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Letzter Erfolg</th>
                <th className="px-4 py-2 font-medium">Letztes Dokument</th>
                <th className="num px-4 py-2 text-right font-medium">Neu 7 T.</th>
                <th className="num px-4 py-2 text-right font-medium">Fehler 7 T.</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const t = sourceTone(s, now);
                const r = data?.repairs[s.id];
                const busy = r && (r.status === "requested" || r.status === "running");
                return (
                  <tr key={s.id} className="border-t border-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="text-slate-900">{s.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{s.id}</span>
                      {s.lastError && t.tone !== "muted" ? (
                        <span className="mt-0.5 block max-w-md truncate text-xs text-slate-400" title={s.lastError}>
                          {s.lastError}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={t.tone}>{t.label}</Pill>
                    </td>
                    <td className={`num px-4 py-2.5 text-xs ${t.tone === "bad" ? "text-red-600" : "text-slate-600"}`}>{ago(s.lastSuccessAt, now)}</td>
                    <td className="num px-4 py-2.5 text-xs text-slate-600">{ago(s.lastDocumentAt, now)}</td>
                    <td className="num px-4 py-2.5 text-right text-xs text-slate-600">{s.newLast7d}</td>
                    <td className={`num px-4 py-2.5 text-right text-xs ${s.errorsLast7d ? "text-slate-900" : "text-slate-400"}`}>{s.errorsLast7d}</td>
                    <td className="px-4 py-2.5 text-right">
                      {s.enabled ? (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void startRepair(s.id)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-900 disabled:cursor-default disabled:text-slate-300"
                        >
                          {busy ? "läuft" : r?.status === "done" ? "Erneut prüfen" : "Reparieren"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!sources.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-400">
                    Noch keine Daten — der erste Herzschlag kommt mit dem nächsten Stundenlauf.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {state?.big4?.length ? (
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Big4-Kanzleien (Fachbeiträge)</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {state.big4.map((b) => (
              <li key={b.firm} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                {b.firm}: <span className="num">{b.articles}</span> Artikel, zuletzt gefunden {ago(b.lastFoundAt, now)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {otherRepairs.length ? (
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">Weitere Reparaturen (7 Tage)</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {otherRepairs.map((r) => (
              <li key={r.source} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <button type="button" onClick={() => setFocus(r.source)} className="text-sm text-slate-900 hover:underline">
                  {r.label}
                </button>
                <Pill tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "live"}>{r.status}</Pill>
                <span className="num text-xs text-slate-400">{fmtBerlin(r.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data?.alerts && Object.keys(data.alerts).length ? (
        <p className="mt-10 text-xs text-slate-400">
          Aktive Alarme (Mail verschickt): {Object.entries(data.alerts).map(([k, a]) => `${a.label} seit ${fmtBerlin(a.since)}`).join(", ")}
        </p>
      ) : null}
      <p className="mt-6 text-xs text-slate-400">
        Regel: Alarm-Mail, sobald eine Quelle oder ein Pipeline-Schritt länger als 24 Stunden nicht erfolgreich lief. Diese Seite ist nur über den Link aus der Mail erreichbar.
      </p>
    </main>
  );
}
