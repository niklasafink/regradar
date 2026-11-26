"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { tx } from "@/lib/core";
import { useStore } from "@/lib/store";
import type { CmpRow, Comparison } from "@/lib/base";
import { changesOnly, isDot, removedTarget, shortComments, T, targetText, type CmpData, type L, type OldPara, type Seg } from "@/lib/cmpData";

/* Fassungsvergleich im Rahmenwerk, Paragraf für Paragraf nach der alten Fassung
   (Buzer-Prinzip): nur die Änderungen im Wortlaut, Umsetzungshinweis als aufklappbarer
   Kommentar rechts, Unverändertes und Wegfallendes als kleine Zeilen. Jede Paragrafenzeile
   ist ein Aufklapp-Schalter mit Pfeil. Farben nur die Ausnahmen aus DESIGN.md. */

const DEL = "text-red-600 line-through decoration-red-600/50";
const INS = "text-blue-600 underline decoration-blue-600/40 underline-offset-2";
const IMP = { high: 0, medium: 1, low: 2 } as const;

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map(([k, x], i) =>
        k === 0 ? <span key={i}>{x}</span> : k === 1 ? <del key={i} className={DEL}>{x}</del> : <ins key={i} className={INS}>{x}</ins>,
      )}
    </>
  );
}

/** Nur die geänderten Absätze, Unverändertes in einer Zeile zusammengefasst. */
function Changes({ p, lang }: { p: OldPara; lang: L }) {
  const items = [
    ...p.abs.map((a) => ({ l: a.l, segs: a.segs, same: a.st === "eq" })),
    ...p.ins.map((a) => ({ l: a.l, segs: a.segs, same: false })),
  ];
  const changed = items.filter((a) => !a.same);
  const same = items.filter((a) => a.same).map((a) => a.l).filter(Boolean);
  return (
    <div className="space-y-2.5 text-[0.9375rem] leading-[1.7] text-slate-700" lang="de">
      {changed.map((a, i) => (
        <p key={i}>
          {a.l && <span className="num mr-1.5 text-xs font-semibold text-slate-400">{a.l}</span>}
          <Segs segs={changesOnly(a.segs)} />
        </p>
      ))}
      {same.length > 0 && (
        <p className="text-xs text-slate-400">{T("Unverändert", "Unchanged", lang)}: {same.join(", ")}</p>
      )}
    </div>
  );
}

function Comments({ rows, lang }: { rows: CmpRow[]; lang: L }) {
  const list = shortComments(rows, lang);
  return (
    <ul className="space-y-2.5">
      {list.map((r, i) => (
        <li key={i} className="text-[0.8125rem] leading-snug">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-400">
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${r.high ? "bg-blue-600" : "bg-slate-300"}`} />
            {r.ref}
          </p>
          <p className={`mt-0.5 ${r.high ? "text-slate-900" : "text-slate-600"}`}>{r.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Kopfzeile: die ganze Zeile ist der Schalter (Pfeil rechts, Hover-Fläche). */
function Toggle({ open, onClick, dot, children, right }: { open: boolean; onClick: () => void; dot: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className="group -mx-2 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
      >
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-900 ${open ? "rotate-180" : ""}`} />
      </button>
      {right}
    </div>
  );
}

function Title({ p, lang }: { p: OldPara; lang: L }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="num text-sm font-semibold tracking-tight">§ {p.n} GwG</span>
      <span className="text-sm text-slate-700">{p.t}</span>
      <span className="text-xs text-slate-400">→ {targetText(p, lang).replace(/^jetzt |^now /, "")}</span>
    </span>
  );
}

/** Wegfallender oder übernommener Paragraf: nur eine Zeile, kein Kommentar. */
function DotRow({ p, lang }: { p: OldPara; lang: L }) {
  const [text, setText] = useState(false);
  const where = p.st === "removed" ? removedTarget(p, lang) : p.st === "same" ? T("inhaltlich übernommen", "carried over", lang) : T("weitgehend neu gefasst", "largely recast", lang);
  return (
    <li className="px-1 py-1">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span aria-hidden className={`size-2 shrink-0 translate-y-px self-center rounded-full ${p.st === "removed" ? "border border-slate-300 bg-white" : "bg-slate-300"}`} />
        <span className="num font-semibold tracking-tight">§ {p.n} GwG</span>
        <span className="text-slate-700">{p.t}</span>
        <span className="text-xs text-slate-400">({where})</span>
        {p.st === "changed" && (
          <button type="button" onClick={() => setText((v) => !v)} className="text-xs font-medium text-slate-900 underline-offset-2 hover:underline">
            {text ? T("Wortlaut ausblenden", "Hide wording", lang) : T("Wortlaut zeigen", "Show wording", lang)}
          </button>
        )}
      </p>
      {text && <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3"><Changes p={p} lang={lang} /></div>}
    </li>
  );
}

/** Geänderter Paragraf: Änderungen im Wortlaut links, kurze Kommentare immer rechts. */
function Para({ p, lang }: { p: OldPara; lang: L }) {
  if (isDot(p)) return <DotRow p={p} lang={lang} />;
  const hasNote = shortComments(p.c, lang).length > 0;
  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)]">
      <Title p={p} lang={lang} />
      <div className={`mt-2.5 grid gap-x-6 gap-y-3 ${hasNote ? "lg:grid-cols-[minmax(0,1fr)_280px]" : ""}`}>
        <div className="min-w-0"><Changes p={p} lang={lang} /></div>
        {hasNote && (
          <aside className="self-start border-slate-200 lg:border-l lg:pl-4">
            <Comments rows={p.c} lang={lang} />
          </aside>
        )}
      </div>
    </li>
  );
}

function NewRow({ n, lang, all }: { n: CmpData["neu"][number]; lang: L; all: boolean | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (all !== null) setOpen(all); }, [all]);
  const has = shortComments(n.c, lang).length > 0;
  return (
    <li>
      {has ? (
        <Toggle open={open} onClick={() => setOpen((v) => !v)} dot="bg-blue-600">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="num whitespace-nowrap text-sm font-semibold tracking-tight">§ {n.n} GwBG-E</span>
            <span className="text-sm text-slate-700">{n.t}</span>
          </span>
        </Toggle>
      ) : (
        <div className="-mx-2 flex items-center gap-2 px-2 py-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-slate-300" />
          <span className="num whitespace-nowrap text-sm font-semibold tracking-tight">§ {n.n} GwBG-E</span>
          <span className="text-sm text-slate-700">{n.t}</span>
        </div>
      )}
      {open && has && <div className="mb-2 ml-4 mt-1 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3"><Comments rows={n.c} lang={lang} /></div>}
    </li>
  );
}

export function VersionCompare({ cmp }: { cmp: Comparison }) {
  const { lang } = useStore();
  const [data, setData] = useState<CmpData | null>(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState<"all" | "changed" | "removed" | "neu">("all");
  const [onlyAct, setOnlyAct] = useState(false);
  const [all, setAll] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(cmp.paras)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CmpData) => live && setData(d))
      .catch(() => live && setErr(true));
    return () => { live = false; };
  }, [cmp.paras]);

  const counts = useMemo(() => {
    if (!data) return null;
    return {
      changed: data.old.filter((p) => !isDot(p)).length,
      removed: data.old.filter((p) => isDot(p) && p.st !== "same").length,
      neu: data.neu.length,
    };
  }, [data]);

  const hasAct = (c: CmpRow[]) => c.some((r) => r.act && r.aud !== "auth");
  const oldShown = data?.old.filter((p) => {
    if (filter === "neu") return false;
    if (filter === "changed" && isDot(p)) return false;
    if (filter === "removed" && !(isDot(p) && p.st !== "same")) return false;
    if (onlyAct && !hasAct(p.c)) return false;
    return true;
  }) ?? [];
  const neuShown = data ? data.neu : [];
  const restShown = data ? data.rest.filter((r) => shortComments([r], lang).length > 0) : [];

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-900"}`;

  const exportDocx = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const { exportCmpDocx } = await import("@/lib/cmpDocx");
      await exportCmpDocx(cmp, lang, { old: oldShown, neu: neuShown, rest: restShown });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={T("Fassungsvergleich", "Version comparison", lang)}>
      {/* Kopf in einer Zeile */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-900">{tx(lang, cmp.from.n)}</span>
        <span aria-hidden className="text-slate-300">→</span>
        <span className="font-medium text-slate-900">{tx(lang, cmp.to.n)}</span>
        <a href={cmp.to.url} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 underline-offset-2 hover:underline">
          {T("Entwurf öffnen", "Open draft", lang)} ↗
        </a>
      </p>

      {err && <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{T("Der Vergleich konnte nicht geladen werden.", "The comparison could not be loaded.", lang)}</p>}
      {!data && !err && <p className="mt-6 text-sm text-slate-400">{T("Vergleich wird geladen …", "Loading comparison …", lang)}</p>}

      {data && counts && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span><del className={DEL}>{T("gestrichen", "deleted", lang)}</del></span>
              <span><ins className={INS}>{T("ergänzt", "inserted", lang)}</ins></span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-blue-600" />{T("Handlungsbedarf", "Action needed", lang)}</span>
            </span>
            <button type="button" onClick={exportDocx} disabled={busy} className="rounded-full bg-slate-900 px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60">
              {busy ? T("Wird erstellt …", "Creating …", lang) : T("Als Word exportieren", "Export to Word", lang)}
            </button>
          </div>

          {oldShown.length > 0 && (
            <ol className="mt-4 space-y-1.5">
              {oldShown.map((p) => <Para key={p.n} p={p} lang={lang} />)}
            </ol>
          )}

          {(neuShown.length > 0 || restShown.length > 0) && (
            <>
              <h2 className="font-heading mt-8 text-base font-medium tracking-tight">
                {T("Neu im GwBG-E, ohne Vorgänger im GwG", "New in the GwBG-E, no predecessor in the GwG", lang)}
              </h2>
              {neuShown.length > 0 && <ol className="mt-2 space-y-0.5">{neuShown.map((n) => <NewRow key={n.n} n={n} lang={lang} all={all} />)}</ol>}
              {restShown.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-medium text-slate-400">{T("Weitere Änderungen, Fristen und Folgeänderungen", "Further changes, deadlines and consequential amendments", lang)}</p>
                  {restShown.map((r, i) => (
                    <article key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)]">
                      <p className="text-xs text-slate-500">
                        {r.oldRef ?? T("keine Entsprechung", "no counterpart", lang)}
                        <span aria-hidden className="mx-1.5 text-slate-300">→</span>
                        <span className="text-slate-900">{r.newRef ?? T("entfällt", "removed", lang)}</span>
                      </p>
                      <div className="mt-2"><Comments rows={[{ ...r, newRef: undefined }]} lang={lang} /></div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
