"use client";

// Praxis-Ansicht: Aufsichtspraxis-Meldungen (Bußgelder, Verwarnungen,
// Maßnahmen …) über alle Quellen, nach Datum absteigend. Bewusst getrennt
// von den regulatorischen Updates — Design analog zur Fristen-Seite.

import { useEffect, useState } from "react";
import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { dt, fmtDate } from "@/lib/logic";
import { PRAXIS, PRAXIS_CAT_LABELS, type PraxisItem } from "@/lib/live";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";

const CATS = Object.keys(PRAXIS_CAT_LABELS) as PraxisItem["cat"][];

export default function Praxis() {
  const { lang } = useStore();
  const [sel, setSel] = useState<PraxisItem["cat"] | null>(null);

  useEffect(() => {
    track("praxis_screen_viewed");
  }, []);

  const all = [...PRAXIS].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime());
  const shown = sel ? all.filter((i) => i.cat === sel) : all;

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
    }`;

  return (
    <>
      <Chrome />

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-wrap items-center gap-4 pt-8">
          <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">
            {lang === "de" ? "Aufsichtspraxis" : "Enforcement practice"}
          </h1>
          <span className="min-w-0 flex-1" />
          <p className="num shrink-0 text-sm text-slate-500">
            {shown.length} {lang === "de" ? "Einträge" : "entries"}
          </p>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
          {lang === "de"
            ? "Einzelfall-Maßnahmen der Aufsicht: Bußgelder, Verwarnungen und Zwangsgelder. Keine neuen Regeln, aber ein Signal, was tatsächlich sanktioniert wird."
            : "Individual supervisory actions: fines, reprimands and penalty payments. Not new rules, but a signal of what actually gets sanctioned."}
        </p>

        {/* Kategorie-Filter wie der Zielgruppen-Filter auf der Fristen-Seite */}
        <nav
          className="mt-5 flex flex-wrap items-center gap-1.5"
          aria-label={lang === "de" ? "Art der Maßnahme" : "Type of measure"}
        >
          <button
            type="button"
            className={pill(sel === null)}
            aria-pressed={sel === null}
            onClick={() => setSel(null)}
          >
            {lang === "de" ? "Alle Arten" : "All types"}
          </button>
          {CATS.filter((c) => all.some((i) => i.cat === c)).map((c) => (
            <button
              key={c}
              type="button"
              className={pill(sel === c)}
              aria-pressed={sel === c}
              onClick={() => setSel(sel === c ? null : c)}
            >
              {PRAXIS_CAT_LABELS[c][lang]}
              <span className="num text-xs opacity-70">
                {all.filter((i) => i.cat === c).length}
              </span>
            </button>
          ))}
        </nav>

        {/* Dezenter Hinweis: Praxis-Meldungen gehen nur monatlich aggregiert raus */}
        <p className="mt-4 text-xs text-slate-400">
          {lang === "de"
            ? "Praxis-Meldungen werden einmal pro Monat aggregiert per Newsletter verschickt."
            : "Enforcement items are sent once a month as an aggregated newsletter."}
        </p>

        {/* Praxis-Tabelle */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="text-xs font-medium text-slate-400">
                <th className="py-2 pr-4 font-medium">
                  {lang === "de" ? "Datum" : "Date"}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {lang === "de" ? "Art" : "Type"}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {lang === "de" ? "Meldung" : "Item"}
                </th>
                <th className="py-2 font-medium">
                  {lang === "de" ? "Behörde" : "Authority"}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr
                  key={`${i.url}-${i.d}`}
                  className="border-t border-slate-50 align-top text-sm"
                >
                  <td className="py-3.5 pr-4 whitespace-nowrap">
                    <span className="num font-medium text-slate-900">
                      {fmtDate(lang, i.d)}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        i.cat === "bussgeld"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 text-slate-700"
                      }`}
                    >
                      {PRAXIS_CAT_LABELS[i.cat][lang]}
                    </span>
                  </td>
                  <td className="min-w-0 py-3.5 pr-4">
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-900 underline-offset-2 hover:underline"
                    >
                      {i.ti}
                    </a>
                    {i.sum && (
                      <span className="mt-1 block max-w-xl text-xs leading-relaxed text-slate-600">
                        {i.sum}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {i.src}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span className="flex items-center gap-2 text-xs text-slate-600">
                      <AuthorityLogo src={i.src} className="h-3 shrink-0" decorative />
                      {i.auth}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {shown.length === 0 && (
          <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            {lang === "de"
              ? "Keine Praxis-Meldungen für diese Auswahl."
              : "No enforcement items for this selection."}
          </p>
        )}

        <p className="mt-10 text-xs text-slate-400">
          {lang === "de"
            ? "Praxis-Meldungen werden automatisch aus den Primärquellen übernommen. Ohne Gewähr, keine Rechtsberatung."
            : "Enforcement items are taken automatically from the primary sources. No guarantee, not legal advice."}
        </p>
      </main>

      <Footer />
    </>
  );
}
