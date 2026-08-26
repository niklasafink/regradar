"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { LastUpdated } from "@/components/last-updated";
import { SearchBox } from "@/components/search";
import { PROVIDERS } from "@/lib/data";
import {
  daysAgo, daysUntil, fmtDate, IMPACT_LABEL, impactOf,
  PROVIDER_SHORT, tx, type Impact,
} from "@/lib/logic";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";
import { UPDATE_PAGES } from "@/lib/updates";

const impactPill = (i: Impact) =>
  `inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
    i === "high"
      ? "bg-slate-900 text-white"
      : i === "medium"
        ? "border border-slate-300 text-slate-700"
        : "border border-slate-200 text-slate-400"
  }`;

export default function AllUpdates() {
  const { lang } = useStore();
  const [sel, setSel] = useState<string | null>(null);

  /* Vorauswahl der Zielgruppe über ?type=, z. B. vom Board aus verlinkt. */
  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("type");
    if (type && PROVIDERS.some((p) => p.id === type)) setSel(type);
    track("updates_screen_viewed");
  }, []);

  const shown = sel
    ? UPDATE_PAGES.filter((p) => p.fw.ents.includes(sel))
    : UPDATE_PAGES;

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
            {lang === "de" ? "Alle Updates" : "All updates"}
          </h1>
          <span className="min-w-0 flex-1" />
          <SearchBox />
          <LastUpdated />
          <p className="num shrink-0 text-sm text-slate-500">
            {shown.length} {lang === "de" ? "Einträge" : "entries"}
          </p>
        </div>

        {/* Zielgruppen-Filter: keine Auswahl heißt alle Institute */}
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
              onClick={() => {
                if (sel !== p.id) {
                  track("institute_selected", { institute: p.id, source: "updates_filter" });
                }
                setSel(sel === p.id ? null : p.id);
              }}
            >
              {tx(lang, PROVIDER_SHORT[p.id] ?? p.n)}
              <span className="num text-xs opacity-70">
                {UPDATE_PAGES.filter((u) => u.fw.ents.includes(p.id)).length}
              </span>
            </button>
          ))}
        </nav>

        {/* Chronologische Liste mit Zeitlinie */}
        <ol className="mt-6">
          {shown.map(({ slug, fw, u }) => {
            const fresh = daysAgo(u.d) <= 14;
            const urgent = u.deadline && daysUntil(u.deadline) < 60;
            const impact = impactOf(u);
            return (
              <li key={slug}>
                <Link
                  href={`/u/${slug}`}
                  className="group grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5rem_1rem_minmax(0,1fr)_10.5rem] sm:gap-x-4"
                >
                  {/* Datum links */}
                  <span className="num pt-2.5 text-right text-xs text-slate-500">
                    {fmtDate(lang, u.d)}
                  </span>

                  {/* Zeitlinie */}
                  <span aria-hidden className="relative flex justify-center">
                    <span className="absolute inset-y-0 w-px bg-slate-200" />
                    <span
                      className={`relative mt-3 size-2 rounded-full ${
                        fresh ? "bg-blue-600" : "border border-slate-300 bg-white"
                      }`}
                    />
                  </span>

                  {/* Eintrag */}
                  <span className="flex min-w-0 flex-col gap-0.5 border-b border-slate-50 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      {/* Logo der veröffentlichenden Behörde, Name steht in der Zeile darunter */}
                      <AuthorityLogo src={u.src} className="h-3.5 shrink-0" />
                      <span className="truncate text-sm font-medium text-slate-900 group-hover:underline group-hover:underline-offset-2">
                        {tx(lang, u.ti)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className={`sm:hidden ${impactPill(impact)}`}>
                        {tx(lang, IMPACT_LABEL[impact])}
                      </span>
                      <span className="truncate">
                        {tx(lang, fw.n)}, {tx(lang, u.t)}
                      </span>
                      {u.deadline && (
                        <span className={`num whitespace-nowrap ${urgent ? "font-medium text-red-600" : ""}`}>
                          {lang === "de" ? "Frist" : "Deadline"} {fmtDate(lang, u.deadline)}
                        </span>
                      )}
                    </span>
                  </span>

                  {/* Impact rechts */}
                  <span className="hidden flex-col items-end gap-1 border-b border-slate-50 py-2.5 sm:flex">
                    <span className={impactPill(impact)}>
                      Impact: {tx(lang, IMPACT_LABEL[impact])}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <p className="mt-10 text-xs text-slate-400">
          {lang === "de"
            ? "Die Impact-Einschätzung ist eine automatische Einordnung nach Dokumenttyp und Frist. Keine Rechtsberatung."
            : "The impact rating is an automatic classification based on document type and deadline. Not legal advice."}
        </p>
      </main>

      <Footer />
    </>
  );
}
