"use client";

// Fristen-Ansicht: alle offenen Konsultationsfristen und kommenden
// Anwendungsdaten über sämtliche Rahmenwerke, nach Datum aufsteigend.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { PROVIDERS } from "@/lib/data";
import {
  authority, daysUntil, dt, fmtDate, PROVIDER_SHORT, tx,
} from "@/lib/logic";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";
import { UPDATE_PAGES, type UpdatePage } from "@/lib/updates";

interface Item extends UpdatePage {
  date: string;
  kind: "deadline" | "eff";
}

/* Offene Fristen aus deadline (Konsultation) und eff (Anwendungsbeginn). */
function openItems(): Item[] {
  const out: Item[] = [];
  for (const p of UPDATE_PAGES) {
    if (p.u.deadline && daysUntil(p.u.deadline) >= 0)
      out.push({ ...p, date: p.u.deadline, kind: "deadline" });
    if (p.u.eff && daysUntil(p.u.eff) >= 0)
      out.push({ ...p, date: p.u.eff, kind: "eff" });
  }
  return out.sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime());
}

export default function Deadlines() {
  const { lang } = useStore();
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    track("deadlines_screen_viewed");
  }, []);

  const all = openItems();
  const shown = sel ? all.filter((i) => i.fw.ents.includes(sel)) : all;

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
            {lang === "de" ? "Offene Fristen" : "Open deadlines"}
          </h1>
          <span className="min-w-0 flex-1" />
          <p className="num shrink-0 text-sm text-slate-500">
            {shown.length} {lang === "de" ? "Einträge" : "entries"}
          </p>
        </div>
        {/* Zielgruppen-Filter wie auf der Updates-Seite */}
        <nav
          className="mt-5 flex flex-wrap items-center gap-1.5"
          aria-label={lang === "de" ? "Institutstyp" : "Institution type"}
        >
          <button
            type="button"
            className={pill(sel === null)}
            aria-pressed={sel === null}
            onClick={() => setSel(null)}
          >
            {lang === "de" ? "Alle Institute" : "All institutions"}
          </button>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={pill(sel === p.id)}
              aria-pressed={sel === p.id}
              onClick={() => setSel(sel === p.id ? null : p.id)}
            >
              {tx(lang, PROVIDER_SHORT[p.id] ?? p.n)}
              <span className="num text-xs opacity-70">
                {all.filter((i) => i.fw.ents.includes(p.id)).length}
              </span>
            </button>
          ))}
        </nav>

        {/* Fristen-Tabelle */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="text-xs font-medium text-slate-400">
                <th className="py-2 pr-4 font-medium">
                  {lang === "de" ? "Fällig" : "Due"}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {lang === "de" ? "Art" : "Type"}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {lang === "de" ? "Dokument" : "Document"}
                </th>
                <th className="py-2 font-medium">
                  {lang === "de" ? "Rahmenwerk" : "Framework"}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const days = daysUntil(i.date);
                const urgent = days < 60;
                return (
                  <tr
                    key={`${i.slug}-${i.kind}`}
                    className="border-t border-slate-50 align-top text-sm"
                  >
                    <td className="py-3.5 pr-4 whitespace-nowrap">
                      <span className={`num font-medium ${urgent ? "text-red-600" : "text-slate-900"}`}>
                        {fmtDate(lang, i.date)}
                      </span>
                      <span className={`num mt-0.5 block text-xs ${urgent ? "text-red-600" : "text-slate-400"}`}>
                        {days === 0
                          ? lang === "de" ? "heute" : "today"
                          : lang === "de" ? `in ${days} Tagen` : `in ${days} days`}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          i.kind === "deadline"
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 text-slate-700"
                        }`}
                      >
                        {i.kind === "deadline"
                          ? lang === "de" ? "Konsultationsfrist" : "Consultation deadline"
                          : lang === "de" ? "Anwendung ab" : "Applies from"}
                      </span>
                    </td>
                    <td className="min-w-0 py-3.5 pr-4">
                      <Link
                        href={`/u/${i.slug}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {tx(lang, i.u.ti)}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{tx(lang, i.u.t)}, {authority(i.u.src)}</span>
                        <span className="num text-slate-400">
                          {lang === "de" ? "veröffentlicht" : "published"} {fmtDate(lang, i.u.d)}
                        </span>
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className="flex items-center gap-2 text-xs text-slate-600">
                        <AuthorityLogo src={i.u.src} className="h-3 shrink-0" decorative />
                        {tx(lang, i.fw.n)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {shown.length === 0 && (
          <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            {lang === "de"
              ? "Keine offenen Fristen für diese Auswahl."
              : "No open deadlines for this selection."}
          </p>
        )}

        <p className="mt-10 text-xs text-slate-400">
          {lang === "de"
            ? "Fristen werden automatisch aus den Primärquellen übernommen. Ohne Gewähr, keine Rechtsberatung."
            : "Deadlines are taken automatically from the primary sources. No guarantee, not legal advice."}
        </p>
      </main>

      <Footer />
    </>
  );
}
