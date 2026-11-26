"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { tx } from "@/lib/core";
import { useStore } from "@/lib/store";
import type { CmpRow, Comparison } from "@/lib/base";
import { changesOnly, isDot, T, targetText, type CmpData, type L, type OldPara, type Seg } from "@/lib/cmpData";

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
  const sorted = [...rows].sort((a, b) => IMP[a.imp] - IMP[b.imp]);
  return (
    <div className="space-y-3">
      {sorted.map((r, i) => (
        <div key={i} className="text-[0.8125rem] leading-relaxed">
          {r.newRef && <p className="text-[0.6875rem] font-medium text-slate-400">{r.newRef}</p>}
          <p className="mt-0.5 text-slate-700">{tx(lang, r.s)}</p>
          {r.act && (
            <p className="mt-1.5">
              <span className="font-medium text-slate-900">{T("Für Institute:", "For institutions:", lang)}</span>{" "}
              <span className="text-slate-600">{tx(lang, r.act)}</span>
            </p>
          )}
          <p className="mt-1 text-[0.6875rem] text-slate-400">{T("Beleg", "Source", lang)}: {r.src}</p>
        </div>
      ))}
    </div>
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

function Para({ p, lang, all }: { p: OldPara; lang: L; all: boolean | null }) {
  const dot = isDot(p);
  const [open, setOpen] = useState(!dot && !p.hv);
  const [note, setNote] = useState(false);
  const [text, setText] = useState(false);
  useEffect(() => { if (all !== null) setOpen(all); }, [all]);
  const hasNote = p.c.length > 0;
  const top = p.c.some((r) => r.imp === "high");
  const noteBtn = hasNote && (
    <button
      type="button"
      aria-expanded={note}
      onClick={() => { setNote((v) => !v); setOpen(true); }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        note ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-900"
      }`}
    >
      {top && <span aria-hidden className={`size-1.5 rounded-full ${note ? "bg-white" : "bg-blue-600"}`} />}
      {T("Umsetzungshinweis", "Implementation note", lang)}
      <span className="num opacity-70">{p.c.length}</span>
    </button>
  );
  const kindDot = p.st === "removed" ? "border border-slate-300 bg-white" : dot ? "bg-slate-300" : "bg-slate-900";
  const sideNote = note && !dot && !p.hv;
  return (
    <li>
      <div className={dot ? "" : "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)]"}>
        <Toggle open={open} onClick={() => setOpen((v) => !v)} dot={kindDot} right={noteBtn || undefined}>
          <Title p={p} lang={lang} />
        </Toggle>
        {open && (
          <div className={`mt-2 grid gap-4 pb-1.5 ${sideNote ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
            <div className="min-w-0">
              {dot ? (
                <>
                  <p className="text-xs leading-relaxed text-slate-500">
                    {p.st === "removed" && !p.to.length
                      ? T("Fällt im nationalen Gesetz weg; die Pflicht gilt ab 10.07.2027 unmittelbar nach der EU-Verordnung.", "Falls away in the national act; the duty applies directly under the EU regulation from 10 July 2027.", lang)
                      : p.st === "same"
                        ? T("Inhaltlich übernommen, nur Verweise angepasst.", "Carried over, only references adjusted.", lang)
                        : T("Weitgehend neu gefasst, kaum Wortlaut übernommen.", "Largely recast, little wording retained.", lang)}{" "}
                    {p.st !== "same" && (
                      <button type="button" onClick={() => setText((v) => !v)} className="font-medium text-slate-900 underline-offset-2 hover:underline">
                        {text ? T("Wortlaut ausblenden", "Hide wording", lang) : T("Wortlaut zeigen", "Show wording", lang)}
                      </button>
                    )}
                  </p>
                  {text && <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3"><Changes p={p} lang={lang} /></div>}
                  {hasNote && <div className="mt-3"><Comments rows={p.c} lang={lang} /></div>}
                </>
              ) : p.hv ? (
                <>
                  <button type="button" onClick={() => setText((v) => !v)} className="text-xs font-medium text-slate-900 underline-offset-2 hover:underline">
                    {text ? T("Wortlaut ausblenden", "Hide wording", lang) : T("Wortlaut mit Änderungen zeigen", "Show wording with changes", lang)}
                  </button>
                  {text && <div className="mt-2"><Changes p={p} lang={lang} /></div>}
                  <div className="mt-3"><Comments rows={p.c} lang={lang} /></div>
                </>
              ) : (
                <Changes p={p} lang={lang} />
              )}
            </div>
            {sideNote && (
              <aside className="self-start rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 lg:sticky lg:top-24">
                <Comments rows={p.c} lang={lang} />
              </aside>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function NewRow({ n, lang, all }: { n: CmpData["neu"][number]; lang: L; all: boolean | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (all !== null) setOpen(all); }, [all]);
  const has = n.c.length > 0;
  return (
    <li>
      {has ? (
        <Toggle open={open} onClick={() => setOpen((v) => !v)} dot="bg-blue-600">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="num text-sm font-semibold tracking-tight">§ {n.n} GwBG-E</span>
            <span className="text-sm text-slate-700">{n.t}</span>
          </span>
        </Toggle>
      ) : (
        <div className="-mx-2 flex items-center gap-2 px-2 py-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-slate-300" />
          <span className="num text-sm font-semibold tracking-tight">§ {n.n} GwBG-E</span>
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
  const neuShown = data && (filter === "all" || filter === "neu") ? data.neu.filter((n) => !onlyAct || hasAct(n.c)) : [];
  const restShown = data && (filter === "all" || filter === "neu") ? data.rest.filter((r) => !onlyAct || (r.act && r.aud !== "auth")) : [];

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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={pill(filter === "all")}>
              {T("Alle", "All", lang)}
            </button>
            <button type="button" aria-pressed={filter === "changed"} onClick={() => setFilter("changed")} className={pill(filter === "changed")}>
              {T("Geändert", "Changed", lang)} <span className="num opacity-70">{counts.changed}</span>
            </button>
            <button type="button" aria-pressed={filter === "removed"} onClick={() => setFilter("removed")} className={pill(filter === "removed")}>
              {T("Entfällt oder neu gefasst", "Removed or recast", lang)} <span className="num opacity-70">{counts.removed}</span>
            </button>
            <button type="button" aria-pressed={filter === "neu"} onClick={() => setFilter("neu")} className={pill(filter === "neu")}>
              {T("Neu im GwBG-E", "New in GwBG-E", lang)} <span className="num opacity-70">{counts.neu}</span>
            </button>
            <button type="button" aria-pressed={onlyAct} onClick={() => setOnlyAct((v) => !v)} className={pill(onlyAct)}>
              {T("Nur mit Handlungsbedarf", "Action needed only", lang)}
            </button>
            <span className="ml-auto flex items-center gap-3 text-xs">
              <button type="button" onClick={() => setAll((v) => (v === true ? false : true))} className="font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
                {all === true ? T("Alles einklappen", "Collapse all", lang) : T("Alles aufklappen", "Expand all", lang)}
              </button>
              <button type="button" onClick={exportDocx} disabled={busy} className="rounded-full bg-slate-900 px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60">
                {busy ? T("Wird erstellt …", "Creating …", lang) : T("Als Word exportieren", "Export to Word", lang)}
              </button>
            </span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span><del className={DEL}>{T("gestrichen", "deleted", lang)}</del></span>
            <span><ins className={INS}>{T("ergänzt", "inserted", lang)}</ins></span>
            <span className="text-slate-400">{T("Paragrafen anklicken, um sie auf- und zuzuklappen", "Click a section to expand or collapse it", lang)}</span>
          </p>

          {oldShown.length > 0 && (
            <ol className="mt-4 space-y-1.5">
              {oldShown.map((p) => <Para key={p.n} p={p} lang={lang} all={all} />)}
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
