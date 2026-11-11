"use client";

// Horizontale Zeitachse für „Alle Updates“: ein Monat je Spalte, links
// Vergangenheit, rechts Zukunft (Anwendungsbeginn, Fristen). Damit die Achse
// bei über tausend Einträgen lesbar bleibt, zeigt jede Spalte nur die
// wichtigsten Einträge des Monats und klappt den Rest auf Klick auf; ältere
// Monate werden schrittweise nachgeladen und leere Zukunftsmonate übersprungen.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthorityLogo } from "@/components/authority-logo";
import { TODAY, type Lang } from "@/lib/base";
import { daysUntil, dt, IMPACT_LABEL, tx, type Impact } from "@/lib/core";

export interface TlItem {
  key: string;
  href: string;
  external?: boolean;
  /** Position auf der Achse, "TT.MM.JJJJ" */
  date: string;
  title: string;
  sub: string;
  src: string;
  kind: "update" | "praxis" | "eff" | "deadline";
  impact?: Impact;
  /** Praxis-Kategorie als Kurzlabel */
  tag?: string;
}

const CAP = 8; // Einträge je Monat ohne Aufklappen
const STEP = 6; // Monate je Nachladen
const WEIGHT: Record<Impact, number> = { high: 2, medium: 1, low: 0 };
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const monthLabel = (lang: Lang, k: number) =>
  new Date(Math.floor(k / 12), k % 12, 1).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    month: "long", year: "numeric",
  });
const shortDay = (d: string) => d.slice(0, 5);

export function Timeline({ items, lang }: { items: TlItem[]; lang: Lang }) {
  const nowKey = monthKey(TODAY);
  const [back, setBack] = useState(STEP - 1); // Monate vor dem aktuellen Monat
  const [open, setOpen] = useState<Set<number>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);
  const todayCol = useRef<HTMLDivElement>(null);

  const { cols, hiddenOlder } = useMemo(() => {
    const byMonth = new Map<number, TlItem[]>();
    for (const it of items) {
      const k = monthKey(dt(it.date));
      const list = byMonth.get(k);
      if (list) list.push(it);
      else byMonth.set(k, [it]);
    }
    const from = nowKey - back;
    const keys: number[] = [];
    for (let k = from; k <= nowKey; k++) keys.push(k); // Vergangenheit lückenlos
    for (const k of [...byMonth.keys()].sort((a, b) => a - b)) if (k > nowKey) keys.push(k); // Zukunft nur mit Inhalt
    const older = [...byMonth.keys()].some((k) => k < from);
    return {
      cols: keys.map((k) => ({
        k,
        list: (byMonth.get(k) ?? []).sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime()),
      })),
      hiddenOlder: older,
    };
  }, [items, back, nowKey]);

  // Beim Öffnen und bei Filterwechsel den aktuellen Monat ins Bild holen
  useEffect(() => {
    const s = scroller.current;
    const c = todayCol.current;
    if (s && c) s.scrollTo({ left: Math.max(0, c.offsetLeft - s.clientWidth * 0.3), behavior: "auto" });
  }, [items, back]);

  const page = (dir: 1 | -1) => {
    const s = scroller.current;
    if (s) s.scrollBy({ left: dir * s.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrow =
    "inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900";

  return (
    <section aria-label={lang === "de" ? "Zeitachse" : "Timeline"} className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <button type="button" className={arrow} onClick={() => page(-1)} aria-label={lang === "de" ? "Nach links" : "Scroll left"}>←</button>
        <button type="button" className={arrow} onClick={() => page(1)} aria-label={lang === "de" ? "Nach rechts" : "Scroll right"}>→</button>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
          onClick={() => {
            const s = scroller.current;
            const c = todayCol.current;
            if (s && c) s.scrollTo({ left: Math.max(0, c.offsetLeft - s.clientWidth * 0.3), behavior: "smooth" });
          }}
        >
          {lang === "de" ? "Zu heute" : "Jump to today"}
        </button>
        <span>
          {lang === "de"
            ? `Je Monat die ${CAP} wichtigsten Einträge, Rest per Klick. Gestrichelt: Anwendungsbeginn und Fristen in der Zukunft.`
            : `Top ${CAP} entries per month, rest on click. Dashed: upcoming application dates and deadlines.`}
        </span>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        className="flex gap-0 overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:thin] focus:outline-none"
      >
        {hiddenOlder && (
          <div className="flex w-28 shrink-0 items-start pr-3 pt-1">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
              onClick={() => setBack(back + STEP)}
            >
              {lang === "de" ? `+${STEP} ältere Monate` : `+${STEP} older months`}
            </button>
          </div>
        )}

        {cols.map(({ k, list }) => {
          const isNow = k === nowKey;
          const expanded = open.has(k);
          // Bei Überfüllung: erst nach Impact, dann nach Aktualität auswählen, anzeigen nach Datum
          const visible = expanded || list.length <= CAP
            ? list
            : [...list]
                .sort((a, b) =>
                  (WEIGHT[b.impact ?? "low"] + (b.kind === "update" ? 0 : 1)) -
                    (WEIGHT[a.impact ?? "low"] + (a.kind === "update" ? 0 : 1)) ||
                  dt(b.date).getTime() - dt(a.date).getTime())
                .slice(0, CAP)
                .sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime());
          const todayIdx = isNow ? visible.findIndex((i) => daysUntil(i.date) > 0) : -1;
          return (
            <div
              key={k}
              ref={isNow ? todayCol : undefined}
              className="w-64 shrink-0 pr-3 sm:w-72"
            >
              {/* Achse: Linie mit Monatspunkt */}
              <div className="relative h-5">
                <span aria-hidden className="absolute inset-x-0 top-2 h-px bg-slate-200" />
                <span
                  aria-hidden
                  className={`absolute left-0 top-1 size-2.5 rounded-full ${
                    isNow ? "bg-blue-600" : k > nowKey ? "border border-dashed border-slate-400 bg-white" : "border border-slate-300 bg-white"
                  }`}
                />
              </div>
              <h3 className="mt-1 flex items-baseline gap-2 text-sm font-medium text-slate-900">
                {monthLabel(lang, k)}
                <span className="num text-xs font-normal text-slate-400">{list.length}</span>
                {isNow && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">
                    {lang === "de" ? "Heute" : "Today"}
                  </span>
                )}
              </h3>

              <ol className="mt-2 flex flex-col gap-2">
                {list.length === 0 && (
                  <li className="text-xs text-slate-300">{lang === "de" ? "Keine Einträge" : "No entries"}</li>
                )}
                {visible.map((it, i) => (
                  <li key={it.key}>
                    {isNow && i === todayIdx && todayIdx > 0 && (
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-blue-600">
                        <span className="h-px flex-1 bg-blue-200" />
                        {lang === "de" ? "heute" : "today"}
                        <span className="h-px flex-1 bg-blue-200" />
                      </div>
                    )}
                    <Card it={it} lang={lang} />
                  </li>
                ))}
              </ol>

              {list.length > CAP && (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                  onClick={() => {
                    const n = new Set(open);
                    if (expanded) n.delete(k);
                    else n.add(k);
                    setOpen(n);
                  }}
                >
                  {expanded
                    ? (lang === "de" ? "Weniger anzeigen" : "Show less")
                    : (lang === "de" ? `+ ${list.length - CAP} weitere` : `+ ${list.length - CAP} more`)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Card({ it, lang }: { it: TlItem; lang: Lang }) {
  const future = it.kind === "eff" || it.kind === "deadline";
  const label =
    it.kind === "eff" ? (lang === "de" ? "Gilt ab" : "Applies from")
    : it.kind === "deadline" ? (lang === "de" ? "Frist" : "Deadline")
    : it.kind === "praxis" ? (it.tag ?? "Praxis")
    : null;
  const cls = `group block rounded-xl border bg-white p-2.5 transition-colors hover:border-slate-400 ${
    future ? "border-dashed border-slate-300" : "border-slate-200"
  }`;
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <AuthorityLogo src={it.src} className="h-3 shrink-0" decorative />
        <span className="num font-medium text-slate-700">{shortDay(it.date)}</span>
        {label && (
          <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${
            future ? "border border-dashed border-slate-400 text-slate-700" : "bg-slate-100 text-slate-600"
          }`}>
            {label}
          </span>
        )}
        {it.impact && it.kind === "update" && it.impact !== "low" && (
          <span className={`ml-auto rounded-full px-1.5 py-px text-[10px] font-medium ${
            it.impact === "high" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"
          }`}>
            {tx(lang, IMPACT_LABEL[it.impact])}
          </span>
        )}
      </span>
      <span className="mt-1 block line-clamp-3 text-[13px] font-medium leading-snug text-slate-900 group-hover:underline group-hover:underline-offset-2">
        {it.title}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{it.sub}</span>
    </>
  );
  return it.external
    ? <a href={it.href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
    : <Link href={it.href} className={cls}>{body}</Link>;
}
