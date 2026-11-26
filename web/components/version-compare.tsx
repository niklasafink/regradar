"use client";

import { useMemo, useState } from "react";
import { fmtDate, tx } from "@/lib/core";
import { useStore } from "@/lib/store";
import { changeRatio, wordDiff, type DiffSeg } from "@/lib/wordDiff";
import type { CmpKind, CmpRow, Comparison } from "@/lib/base";

/* Fassungsvergleich im Rahmenwerk: alte gegen neue Fassung mit Änderungsverfolgung.
   Löschungen rot durchgestrichen, Einfügungen blau unterstrichen (die beiden
   Farbausnahmen aus DESIGN.md), alles andere schwarz-weiß. */

const KIND_ORDER: CmpKind[] = ["changed", "new", "removed", "moved"];
const KIND_LABEL: Record<CmpKind, { de: string; en: string }> = {
  changed: { de: "Geändert", en: "Changed" },
  new: { de: "Neu", en: "New" },
  removed: { de: "Entfällt", en: "Removed" },
  moved: { de: "Verlagert", en: "Moved" },
  same: { de: "Unverändert", en: "Unchanged" },
};
const KIND_PILL: Record<CmpKind, string> = {
  changed: "bg-slate-900 text-white",
  new: "bg-blue-600 text-white",
  removed: "border border-slate-300 bg-white text-slate-500",
  moved: "border border-slate-300 bg-white text-slate-600",
  same: "bg-slate-100 text-slate-500",
};

const DEL = "text-red-600 line-through decoration-red-600/50";
const INS = "text-blue-600 underline decoration-blue-600/40 underline-offset-2";

function Segs({ segs, side }: { segs: DiffSeg[]; side?: "old" | "new" }) {
  return (
    <>
      {segs.map((s, i) => {
        if (s.k === "eq") return <span key={i}>{s.x}</span>;
        if (s.k === "del") return side === "new" ? null : <del key={i} className={DEL}>{s.x}</del>;
        return side === "old" ? null : <ins key={i} className={INS}>{s.x}</ins>;
      })}
    </>
  );
}

function segsFor(r: CmpRow): DiffSeg[] {
  if (r.oldText && r.newText) return wordDiff(r.oldText, r.newText);
  if (r.newText) return [{ k: r.kind === "new" ? "ins" : "eq", x: r.newText }];
  if (r.oldText) return [{ k: r.kind === "removed" ? "del" : "eq", x: r.oldText }];
  return [];
}

function Wording({ r, mode, lang }: { r: CmpRow; mode: "track" | "side"; lang: "de" | "en" }) {
  const segs = useMemo(() => segsFor(r), [r]);
  if (segs.length === 0) return null;
  // Wurde die Norm weitgehend neu geschrieben, ist die Änderungsverfolgung nur Rauschen:
  // dann immer alt neben neu.
  const rewritten = !!(r.oldText && r.newText) && changeRatio(segs) > 0.75;
  if (rewritten) mode = "side";
  const box = "rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-slate-700";
  if (mode === "track") {
    return (
      <p className={box} lang="de">
        <Segs segs={segs} />
      </p>
    );
  }
  const none = lang === "de" ? "Keine Entsprechung" : "No counterpart";
  return (
    <div className="grid gap-2 lg:grid-cols-2" lang="de">
      <div>
        <p className="mb-1 text-[0.6875rem] font-medium text-slate-400">
          {lang === "de" ? "Alt" : "Old"}{r.oldRef ? `: ${r.oldRef}` : ""}
        </p>
        <p className={box}>{r.oldText ? <Segs segs={segs} side="old" /> : <span className="text-slate-400">{none}</span>}</p>
      </div>
      <div>
        <p className="mb-1 text-[0.6875rem] font-medium text-slate-400">
          {lang === "de" ? "Neu" : "New"}{r.newRef ? `: ${r.newRef}` : ""}
        </p>
        <p className={box}>{r.newText ? <Segs segs={segs} side="new" /> : <span className="text-slate-400">{none}</span>}</p>
      </div>
    </div>
  );
}

export function VersionCompare({ cmp }: { cmp: Comparison }) {
  const { lang } = useStore();
  const [kind, setKind] = useState<CmpKind | "all">("all");
  const [onlyAct, setOnlyAct] = useState(false);
  const [mode, setMode] = useState<"track" | "side">("track");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: cmp.rows.length };
    for (const r of cmp.rows) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [cmp]);

  const rows = cmp.rows.filter(
    (r) => (kind === "all" || r.kind === kind) && (!onlyAct || (r.act && r.aud !== "auth")),
  );
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-900"
    }`;

  return (
    <section aria-label={lang === "de" ? "Fassungsvergleich" : "Version comparison"}>
      {/* Alt gegen Neu */}
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[0.6875rem] font-medium text-slate-400">{lang === "de" ? "Alte Fassung" : "Current version"}</p>
          <p className="mt-1 text-sm font-semibold tracking-tight">{tx(lang, cmp.from.n)}</p>
          <p className="num mt-0.5 text-xs text-slate-500">{cmp.from.ref}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{tx(lang, cmp.from.note)}</p>
        </div>
        <div aria-hidden className="hidden items-center text-slate-300 sm:flex">→</div>
        <div className="rounded-2xl border border-slate-900 bg-white p-4">
          <p className="text-[0.6875rem] font-medium text-slate-400">{lang === "de" ? "Neue Fassung" : "New version"}</p>
          <p className="mt-1 text-sm font-semibold tracking-tight">{tx(lang, cmp.to.n)}</p>
          <p className="num mt-0.5 text-xs text-slate-500">{cmp.to.ref}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{tx(lang, cmp.to.note)}</p>
          <a
            href={cmp.to.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {lang === "de" ? "Entwurf öffnen" : "Open draft"} ↗
          </a>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{tx(lang, cmp.intro)}</p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
        {tx(lang, cmp.caveat)} {lang === "de" ? "Stand" : "As of"} <span className="num">{fmtDate(lang, cmp.stand)}</span>.
      </p>

      {/* Filter und Ansicht */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} className={pill(kind === "all")}>
          {lang === "de" ? "Alle" : "All"} <span className="num opacity-70">{counts.all}</span>
        </button>
        {KIND_ORDER.filter((k) => counts[k]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={pill(kind === k)}>
            {KIND_LABEL[k][lang]} <span className="num opacity-70">{counts[k]}</span>
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
        <button type="button" aria-pressed={onlyAct} onClick={() => setOnlyAct((v) => !v)} className={pill(onlyAct)}>
          {lang === "de" ? "Nur mit Handlungsbedarf" : "Action needed only"}
        </button>
        <div className="ml-auto inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium" role="group" aria-label={lang === "de" ? "Ansicht" : "View"}>
          {(["track", "side"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 transition-colors ${mode === m ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {m === "track" ? (lang === "de" ? "Änderungen" : "Track changes") : lang === "de" ? "Alt neben Neu" : "Side by side"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><del className={DEL}>{lang === "de" ? "gestrichen" : "deleted"}</del></span>
        <span><span className={INS}>{lang === "de" ? "ergänzt" : "inserted"}</span></span>
        <span className="text-slate-400">{lang === "de" ? "Wortlaut deutsch, wie im Entwurf" : "Wording in German, as in the draft"}</span>
      </p>

      {rows.length === 0 && (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {lang === "de" ? "Keine Einträge für diese Auswahl." : "No entries for this selection."}
        </p>
      )}

      {cmp.groups.map((g) => {
        const gr = rows.filter((r) => r.g === g.id);
        if (gr.length === 0) return null;
        return (
          <div key={g.id} className="mt-8">
            <h2 className="font-heading text-base font-medium tracking-tight">
              {tx(lang, g.n)} <span className="num ml-1 text-xs font-normal text-slate-400">{gr.length}</span>
            </h2>
            <div className="mt-3 space-y-3">
              {gr.map((r, i) => (
                <article key={`${g.id}-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)]">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-0.5 font-medium ${KIND_PILL[r.kind]}`}>{KIND_LABEL[r.kind][lang]}</span>
                    <span className="text-slate-500">
                      {r.oldRef ?? (lang === "de" ? "keine Entsprechung" : "no counterpart")}
                      <span aria-hidden className="mx-1.5 text-slate-300">→</span>
                      <span className="text-slate-900">{r.newRef ?? (lang === "de" ? "entfällt" : "removed")}</span>
                    </span>
                    {r.aud === "auth" && (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-400">
                        {lang === "de" ? "betrifft Behörden" : "authorities only"}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700">{tx(lang, r.s)}</p>
                  {r.act && (
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed">
                      <span className="font-medium text-slate-900">{lang === "de" ? "Für Institute:" : "For institutions:"}</span>{" "}
                      <span className="text-slate-600">{tx(lang, r.act)}</span>
                    </p>
                  )}
                  {(r.oldText || r.newText) && (
                    <details className="group mt-3" open={r.imp === "high"}>
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-900 underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                        {lang === "de" ? "Wortlaut vergleichen" : "Compare wording"}
                        <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">›</span>
                      </summary>
                      <div className="mt-2"><Wording r={r} mode={mode} lang={lang} /></div>
                    </details>
                  )}
                  <p className="mt-3 text-[0.6875rem] text-slate-400">{lang === "de" ? "Beleg" : "Source"}: {r.src}</p>
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
