"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { fmtDate, tx } from "@/lib/core";
import { useStore } from "@/lib/store";
import type { CmpRow, Comparison } from "@/lib/base";

/* Fassungsvergleich im Rahmenwerk, Paragraf für Paragraf nach der alten Fassung
   (Buzer-Prinzip): Wortlaut als Fließtext mit Änderungsverfolgung, Umsetzungshinweis
   als aufklappbarer Kommentar rechts, Unverändertes und Verlagertes als kleine Dots.
   Farben nur die beiden Ausnahmen aus DESIGN.md: Rot-600 gelöscht, Blau-600 ergänzt. */

type Seg = [0 | 1 | 2, string];
interface Abs { l: string; st: "eq" | "chg" | "del"; to?: string; segs: Seg[] }
interface OldPara { n: string; t: string; hv: boolean; st: "same" | "changed" | "removed"; to: string[]; abs: Abs[]; ins: { l: string; to: string; segs: Seg[] }[]; c: CmpRow[] }
interface NewPara { n: string; t: string; c: CmpRow[] }
interface Data { old: OldPara[]; neu: NewPara[]; rest: CmpRow[] }

const DEL = "text-red-600 line-through decoration-red-600/50";
const INS = "text-blue-600 underline decoration-blue-600/40 underline-offset-2";

const T = (de: string, en: string, lang: "de" | "en") => (lang === "de" ? de : en);
const toLabel = (to: string[]) => (to.length ? `§ ${to.join(", ")} GwBG-E` : "");

/* Langer unveränderter Text wird auf Anfang und Ende gekürzt, bis man ihn aufklappt. */
function Eq({ x, full }: { x: string; full: boolean }) {
  const [open, setOpen] = useState(false);
  const words = x.split(/(\s+)/);
  const n = words.filter((w) => w.trim()).length;
  if (full || open || n <= 34) return <>{x}</>;
  const head = words.slice(0, 2 * 9).join("");
  const tail = words.slice(-2 * 9).join("");
  return (
    <>
      {head}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-1 rounded-full border border-slate-200 px-2 py-px text-[0.6875rem] font-medium text-slate-500 hover:border-slate-900 hover:text-slate-900"
        title="unveränderten Text zeigen"
      >
        … {n - 18}
      </button>
      {tail}
    </>
  );
}

function Segs({ segs, full }: { segs: Seg[]; full: boolean }) {
  return (
    <>
      {segs.map(([k, x], i) =>
        k === 0 ? <Eq key={i} x={x} full={full} /> : k === 1 ? <del key={i} className={DEL}>{x}</del> : <ins key={i} className={INS}>{x}</ins>,
      )}
    </>
  );
}

function Paragraphs({ p, full, lang }: { p: OldPara; full: boolean; lang: "de" | "en" }) {
  const items = [
    ...p.abs.map((a) => ({ key: "a" + a.l, l: a.l, segs: a.segs, same: a.st === "eq", to: a.to })),
    ...p.ins.map((a) => ({ key: "i" + a.l, l: a.l, segs: a.segs, same: false, to: a.to })),
  ];
  return (
    <div className="space-y-2.5 text-[0.9375rem] leading-[1.7] text-slate-700" lang="de">
      {items.map((a) => (
        <p key={a.key}>
          {a.l && <span className="num mr-1.5 text-xs font-semibold text-slate-400">{a.l}</span>}
          {a.same && !full ? (
            <span className="text-slate-400">
              {T("unverändert", "unchanged", lang)}
              <span className="ml-1.5 text-xs">{a.to ? `(${T("jetzt § ", "now § ", lang)}${a.to})` : ""}</span>
            </span>
          ) : (
            <Segs segs={a.segs} full={full} />
          )}
        </p>
      ))}
    </div>
  );
}

const IMP = { high: 0, medium: 1, low: 2 } as const;
/* Kleine Zeile statt Block: wegfallend, übernommen oder so stark neu gefasst, dass kein sinnvoller Fließtext-Vergleich bleibt (und kein Hinweis existiert). */
const isDot = (p: OldPara) => p.st === "removed" || p.st === "same" || (p.hv && p.c.length === 0);

function Comments({ rows, lang }: { rows: CmpRow[]; lang: "de" | "en" }) {
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

/* Kopf eines Paragrafen: Nummer, Titel, Ziel */
function Head({ p, lang }: { p: OldPara; lang: "de" | "en" }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="num text-sm font-semibold tracking-tight">§ {p.n} GwG</span>
      <span className="text-sm text-slate-700">{p.t}</span>
      <span className="text-xs text-slate-400">
        {p.to.length ? <>→ {toLabel(p.to)}</> : T("→ künftig in der EU-Geldwäscheverordnung", "→ in future in the EU AML Regulation", lang)}
      </span>
    </div>
  );
}

/* Winzige Zeile: verlagert oder wegfallend, Text auf Klick */
function DotRow({ p, lang, forceOpen }: { p: OldPara; lang: "de" | "en"; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen;
  return (
    <li className="relative pl-5">
      <span aria-hidden className={`absolute left-0 top-[0.55rem] size-1.5 rounded-full ${p.st === "removed" ? "border border-slate-300 bg-white" : "bg-slate-300"}`} />
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={shown} className="w-full py-0.5 text-left hover:text-slate-900">
        <Head p={p} lang={lang} />
      </button>
      {shown && (
        <div className="mb-2 mt-1 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
          <p className="mb-2 text-xs text-slate-400">
            {p.st === "removed"
              ? T("Fällt im nationalen Gesetz weg; die Pflicht gilt ab 10.07.2027 unmittelbar nach der EU-Verordnung. Bisheriger Wortlaut:", "Falls away in the national act; the duty applies directly under the EU regulation from 10 July 2027. Previous wording:", lang)
              : p.st === "same"
                ? T("Inhaltlich übernommen, nur Verweise angepasst.", "Carried over, only references adjusted.", lang)
                : T("Weitgehend neu gefasst, kaum Wortlaut übernommen. Bisheriger Wortlaut mit den Änderungen:", "Largely recast, little wording retained. Previous wording with the changes:", lang)}
          </p>
          <Paragraphs p={p} full lang={lang} />
          {p.c.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3"><Comments rows={p.c} lang={lang} /></div>}
        </div>
      )}
    </li>
  );
}

/* Geänderter Paragraf: Fließtext links, Kommentar rechts zum Aufklappen */
function Block({ p, lang, defaultFull }: { p: OldPara; lang: "de" | "en"; defaultFull: boolean }) {
  const [full, setFull] = useState(defaultFull);
  const [note, setNote] = useState(p.hv);
  const [text, setText] = useState(!p.hv);
  const hasNote = p.c.length > 0;
  const top = p.c.some((r) => r.imp === "high");
  return (
    <li className="relative pl-5">
      <span aria-hidden className="absolute left-0 top-[0.5rem] size-2 rounded-full bg-slate-900" />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <Head p={p} lang={lang} />
          <div className="flex shrink-0 items-center gap-2 text-xs">
            {text ? (
              <button type="button" onClick={() => setFull((v) => !v)} className="font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
                {full ? T("Nur Änderungen", "Changes only", lang) : T("Ganzer Wortlaut", "Full wording", lang)}
              </button>
            ) : (
              <button type="button" onClick={() => setText(true)} className="font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
                {T("Wortlaut mit Änderungen", "Wording with changes", lang)}
              </button>
            )}
            {hasNote && (
              <button
                type="button"
                aria-expanded={note}
                onClick={() => setNote((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors ${
                  note ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-900"
                }`}
              >
                {top && <span aria-hidden className={`size-1.5 rounded-full ${note ? "bg-white" : "bg-blue-600"}`} />}
                {T("Umsetzungshinweis", "Implementation note", lang)}
                <span className="num opacity-70">{p.c.length}</span>
              </button>
            )}
          </div>
        </div>
        <div className={`mt-3 grid gap-4 ${note && text ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
          {text && <Paragraphs p={p} full={full} lang={lang} />}
          {note && (
            <aside className="self-start rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 lg:sticky lg:top-24">
              <Comments rows={p.c} lang={lang} />
            </aside>
          )}
        </div>
      </div>
    </li>
  );
}

function NewRow({ n, lang }: { n: NewPara; lang: "de" | "en" }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative pl-5">
      <span aria-hidden className={`absolute left-0 top-[0.55rem] size-1.5 rounded-full ${n.c.length ? "bg-blue-600" : "bg-slate-300"}`} />
      <button type="button" disabled={!n.c.length} onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full py-0.5 text-left disabled:cursor-default enabled:hover:text-slate-900">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="num text-sm font-semibold tracking-tight">§ {n.n} GwBG-E</span>
          <span className="text-sm text-slate-700">{n.t}</span>
          {n.c.length > 0 && <span className="text-xs text-slate-400">{T("Hinweis", "Note", lang)} ▸</span>}
        </span>
      </button>
      {open && <div className="mb-2 mt-1 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3"><Comments rows={n.c} lang={lang} /></div>}
    </li>
  );
}

export function VersionCompare({ cmp }: { cmp: Comparison }) {
  const { lang } = useStore();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState<"all" | "changed" | "removed" | "neu">("all");
  const [onlyAct, setOnlyAct] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(cmp.paras)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => live && setData(d))
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

  return (
    <section aria-label={T("Fassungsvergleich", "Version comparison", lang)}>
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[0.6875rem] font-medium text-slate-400">{T("Alte Fassung", "Current version", lang)}</p>
          <p className="mt-1 text-sm font-semibold tracking-tight">{tx(lang, cmp.from.n)}</p>
          <p className="num mt-0.5 text-xs text-slate-500">{cmp.from.ref}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{tx(lang, cmp.from.note)}</p>
        </div>
        <div aria-hidden className="hidden items-center text-slate-300 sm:flex">→</div>
        <div className="rounded-2xl border border-slate-900 bg-white p-4">
          <p className="text-[0.6875rem] font-medium text-slate-400">{T("Neue Fassung", "New version", lang)}</p>
          <p className="mt-1 text-sm font-semibold tracking-tight">{tx(lang, cmp.to.n)}</p>
          <p className="num mt-0.5 text-xs text-slate-500">{cmp.to.ref}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{tx(lang, cmp.to.note)}</p>
          <a href={cmp.to.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-medium text-slate-900 underline-offset-2 hover:underline">
            {T("Entwurf öffnen", "Open draft", lang)} ↗
          </a>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{tx(lang, cmp.intro)}</p>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
        {tx(lang, cmp.caveat)} {T("Stand", "As of", lang)} <span className="num">{fmtDate(lang, cmp.stand)}</span>.
      </p>

      {err && <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{T("Der Vergleich konnte nicht geladen werden.", "The comparison could not be loaded.", lang)}</p>}
      {!data && !err && <p className="mt-6 text-sm text-slate-400">{T("Vergleich wird geladen …", "Loading comparison …", lang)}</p>}

      {data && counts && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
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
            <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
            <button type="button" aria-pressed={onlyAct} onClick={() => setOnlyAct((v) => !v)} className={pill(onlyAct)}>
              {T("Nur mit Handlungsbedarf", "Action needed only", lang)}
            </button>
            <button type="button" onClick={() => setAllOpen((v) => !v)} className="ml-auto text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
              {allOpen ? T("Alles einklappen", "Collapse all", lang) : T("Alles aufklappen", "Expand all", lang)}
            </button>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span><del className={DEL}>{T("gestrichen", "deleted", lang)}</del></span>
            <span><ins className={INS}>{T("ergänzt", "inserted", lang)}</ins></span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-slate-900" />{T("geändert", "changed", lang)}</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-slate-300" />{T("übernommen", "carried over", lang)}</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full border border-slate-300" />{T("entfällt", "removed", lang)}</span>
            <span className="text-slate-400">{T("Wortlaut deutsch, wie in den Gesetzen", "Wording in German, as in the statutes", lang)}</span>
          </p>

          {oldShown.length > 0 && (
            <>
              <h2 className="font-heading mt-8 text-base font-medium tracking-tight">
                {T("Das heutige GwG, Paragraf für Paragraf", "The current GwG, section by section", lang)}
              </h2>
              <ol className="relative mt-3 space-y-1.5 before:absolute before:bottom-1 before:left-[0.2rem] before:top-1 before:w-px before:bg-slate-200">
                {oldShown.map((p) =>
                  isDot(p) ? (
                    <DotRow key={p.n} p={p} lang={lang} forceOpen={allOpen} />
                  ) : (
                    <Block key={p.n} p={p} lang={lang} defaultFull={allOpen} />
                  ),
                )}
              </ol>
            </>
          )}

          {(neuShown.length > 0 || restShown.length > 0) && (
            <>
              <h2 className="font-heading mt-10 text-base font-medium tracking-tight">
                {T("Neu im GwBG-E, ohne Vorgänger im GwG", "New in the GwBG-E, no predecessor in the GwG", lang)}
              </h2>
              {neuShown.length > 0 && (
                <ol className="relative mt-3 space-y-1.5 before:absolute before:bottom-1 before:left-[0.2rem] before:top-1 before:w-px before:bg-slate-200">
                  {neuShown.map((n) => <NewRow key={n.n} n={n} lang={lang} />)}
                </ol>
              )}
              {restShown.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-medium text-slate-400">{T("Weitere Änderungen, Fristen und Folgeänderungen", "Further changes, deadlines and consequential amendments", lang)}</p>
                  {restShown.map((r, i) => (
                    <Fragment key={i}>
                      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)]">
                        <p className="text-xs text-slate-500">
                          {r.oldRef ?? T("keine Entsprechung", "no counterpart", lang)}
                          <span aria-hidden className="mx-1.5 text-slate-300">→</span>
                          <span className="text-slate-900">{r.newRef ?? T("entfällt", "removed", lang)}</span>
                        </p>
                        <div className="mt-2"><Comments rows={[{ ...r, newRef: undefined }]} lang={lang} /></div>
                      </article>
                    </Fragment>
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

