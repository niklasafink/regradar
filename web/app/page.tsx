"use client";

import Link from "next/link";
import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, SlimFooter } from "@/components/chrome";
import { LastUpdated } from "@/components/last-updated";
import { SubscribeBox } from "@/components/subscribe";
import { PROVIDERS } from "@/lib/data";
import {
  FRAMEWORKS, daysAgo, daysUntil, fmtDate, IMPACT_LABEL, impactOf, tx, type Impact,
} from "@/lib/logic";
import { useStore } from "@/lib/store";
import { UPDATE_PAGES } from "@/lib/updates";

const impactPill = (i: Impact) =>
  `inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
    i === "high"
      ? "bg-slate-900 text-white"
      : i === "medium"
        ? "border border-slate-300 text-slate-700"
        : "border border-slate-200 text-slate-400"
  }`;

export default function Home() {
  const { lang } = useStore();

  /* Neueste Einträge, identisch zur Ansicht auf /updates */
  const recent = UPDATE_PAGES.slice(0, 6);
  const totalUpdates = FRAMEWORKS.reduce((n, f) => n + f.u.length, 0);

  return (
    <>
      <Chrome />
      <main>
        {/* Hero mit Anbieterauswahl, alles auf einem Screen */}
        <section id="rahmenwerke" className="mx-auto max-w-5xl px-4 pt-10 pb-10 text-center sm:px-6 sm:pt-14">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <p className="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-500">
              <span className="num font-semibold text-slate-900">{FRAMEWORKS.length}</span>
              <span className="ml-1">{lang === "de" ? "Rahmenwerke" : "frameworks"}</span>
              <span className="mr-1.5">,</span>
              <span className="num font-semibold text-slate-900">{totalUpdates}</span>
              <span className="ml-1">Updates</span>
            </p>
            <LastUpdated />
          </div>
          <h1 className="font-heading mx-auto max-w-3xl text-balance text-4xl leading-[1.08] font-medium tracking-tight text-slate-900 sm:text-5xl">
            {lang === "de"
              ? "Alle Regulatorik, kostenlos an einem Ort."
              : "All regulation, free in one place."}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg">
            {lang === "de"
              ? "Regulatorische Änderungen aus Deutschland und der EU kostenlos verfolgen. Sehen Sie auf einen Blick, welche neuen Vorgaben und Änderungen Ihr Institut betreffen."
              : "Track regulatory change from Germany and the EU for free. See at a glance which new requirements and changes affect your institution."}
          </p>

          <SubscribeBox />

          <div className="mt-10 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
            {PROVIDERS.map((p) => {
              const count = FRAMEWORKS.filter((f) => f.ents.includes(p.id)).length;
              return (
                <Link
                  key={p.id}
                  href={`/r/${p.id}`}
                  data-fast-goal="institute_selected"
                  data-fast-goal-institute={p.id}
                  data-fast-goal-source="home"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)] transition-all hover:border-slate-900 hover:shadow-[0_2px_4px_rgb(31_30_26/0.05),0_8px_24px_rgb(31_30_26/0.1)]"
                >
                  <span className="text-sm font-semibold tracking-tight">{tx(lang, p.n)}</span>
                  <span className="num shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Tool-Vorschau */}
          <div className="mt-10 rounded-[2rem] bg-gradient-to-b from-slate-100 to-slate-50 p-3 sm:p-8">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-slate-200" />
                  <span className="size-2.5 rounded-full bg-slate-200" />
                  <span className="size-2.5 rounded-full bg-slate-200" />
                </span>
                <span className="text-xs text-slate-400">regulatory-radar.de/updates</span>
              </div>
              <ol className="px-5 py-3">
                {recent.map(({ slug, fw, u }) => {
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
              <div className="border-t border-slate-100 px-5 py-3 text-right">
                <Link
                  href="/updates"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  {lang === "de"
                    ? `Alle ${totalUpdates} Updates ansehen →`
                    : `View all ${totalUpdates} updates →`}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SlimFooter />
    </>
  );
}
