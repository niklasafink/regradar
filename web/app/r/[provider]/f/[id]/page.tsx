"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AuthorityLogo, FirmLogo, FRAMEWORK_AUTH } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { ABOUT_LONG } from "@/lib/data";
import {
  daysAgo, daysUntil, dt, fmtDate, frameworkById, providerById,
  topicById, tx, visibleFrameworks,
} from "@/lib/logic";
import { updateHref } from "@/lib/updates";
import { useStore } from "@/lib/store";

export default function FrameworkDetail() {
  const { provider, id } = useParams<{ provider: string; id: string }>();
  const { lang } = useStore();

  const p = providerById(provider);
  const f = frameworkById(id);
  if (!p || !f) notFound();
  const t = topicById(f.topic)!;

  const ups = [...f.u].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime());
  const fresh = ups.filter((u) => daysAgo(u.d) <= 30).length;
  const sources = [...new Set(ups.map((u) => u.src))];
  const siblings = visibleFrameworks(provider, null)
    .filter((x) => x.topic === f.topic && x.id !== f.id);

  const stats = [
    { v: ups.length, l: lang === "de" ? "Updates gesamt" : "Updates in total" },
    { v: fresh, l: lang === "de" ? "Letzte 30 Tage" : "Last 30 days" },
    { v: ups[0] ? fmtDate(lang, ups[0].d) : "–", l: lang === "de" ? "Letzte Änderung" : "Last change" },
    { v: ups[0] ? fmtDate(lang, ups[ups.length - 1].d) : "–", l: lang === "de" ? "Ältester Eintrag" : "Oldest entry" },
  ];

  return (
    <>
      <Chrome />

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Link
          href={`/r/${provider}`}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <span aria-hidden>←</span>
          {lang === "de" ? "Übersicht" : "Overview"}: {tx(lang, t.n)}
        </Link>

        {/* Kopf */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-600">
              {tx(lang, t.n)}
            </span>
            {f.condL && (
              <span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs font-medium text-slate-500">
                {tx(lang, f.condL)}
              </span>
            )}
          </div>
          <AuthorityLogo
            src={FRAMEWORK_AUTH[f.id] ?? ups[0]?.src ?? "eur-lex.europa.eu"}
            className="mt-5 h-7"
          />
          <h1 className="font-heading mt-3 max-w-3xl text-balance text-2xl font-medium tracking-tight sm:text-4xl">
            {tx(lang, f.n)}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">{f.ref}, {f.jur}</p>
          {ABOUT_LONG[f.id] && (
            <details className="group mt-4 max-w-3xl rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold tracking-tight text-slate-900 [&::-webkit-details-marker]:hidden">
                {lang === "de" ? "Mehr zum Rahmenwerk" : "More about this framework"}
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="space-y-3 border-t border-slate-100 px-4 pt-3 pb-4 text-sm leading-relaxed text-slate-600">
                {ABOUT_LONG[f.id].map((para, i) => (
                  <p key={i}>{tx(lang, para)}</p>
                ))}
              </div>
            </details>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.l} className="bg-white px-4 py-3">
              <dd className="num text-base font-semibold tracking-tight text-slate-900">{s.v}</dd>
              <dt className="mt-0.5 text-xs font-medium text-slate-500">{s.l}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          {/* Update-Verlauf als Zeitleiste */}
          <div>
            {ups.length === 0 && (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-500">
                {lang === "de"
                  ? "Für dieses Rahmenwerk liegen noch keine Updates vor. Neue Meldungen aus den Primärquellen erscheinen hier automatisch."
                  : "No updates for this framework yet. New releases from the primary sources will appear here automatically."}
              </p>
            )}
            {ups.map((u, i) => {
              const isNew = daysAgo(u.d) <= 14;
              const urgent = u.deadline && daysUntil(u.deadline) < 60;
              const last = i === ups.length - 1;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[4.5rem_auto_1fr] gap-x-4 sm:grid-cols-[6rem_auto_1fr] sm:gap-x-6"
                >
                  {/* Datum links */}
                  <span className="num pt-4 text-right text-xs font-medium leading-4 text-slate-500">
                    {fmtDate(lang, u.d)}
                  </span>

                  {/* durchgehende Linie mit Punkt */}
                  <div aria-hidden className="relative flex w-2.5 justify-center">
                    <span
                      className={`w-px bg-slate-200 ${i === 0 ? "mt-5" : ""} ${last ? "h-5" : ""}`}
                    />
                    <span
                      className={`absolute top-[1.1875rem] size-2.5 rounded-full ${
                        isNew ? "bg-blue-600" : "border border-slate-300 bg-white"
                      }`}
                    />
                  </div>

                  <article
                    className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)] ${last ? "" : "mb-3"}`}
                  >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
                      {tx(lang, u.t)}
                    </span>
                    {isNew && (
                      <span className="rounded-full bg-blue-600 px-2.5 py-0.5 font-medium text-white">
                        {lang === "de" ? "Neu" : "New"}
                      </span>
                    )}
                    <AuthorityLogo src={u.src} className="h-3.5" />
                    {u.refnum && <span className="num text-slate-400">{u.refnum}</span>}
                  </div>
                  <h2 className="mt-2 text-sm font-semibold tracking-tight">
                    <Link
                      href={updateHref(f.id, u)}
                      className="underline-offset-2 hover:underline"
                    >
                      {tx(lang, u.ti)}
                    </Link>
                  </h2>
                  {tx(lang, u.s) && (
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                      {tx(lang, u.s)}
                    </p>
                  )}
                  {(u.deadline || u.eff) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
                      {u.deadline && (
                        <span className={urgent ? "font-medium text-red-600" : "text-slate-600"}>
                          {lang === "de" ? "Frist" : "Deadline"}{" "}
                          <span className="num">{fmtDate(lang, u.deadline)}</span>{" "}
                          ({daysUntil(u.deadline)} {lang === "de" ? "Tage" : "days"})
                        </span>
                      )}
                      {u.eff && (
                        <span className="text-slate-600">
                          {lang === "de" ? "Anwendung ab" : "Applies from"}{" "}
                          <span className="num">{fmtDate(lang, u.eff)}</span>
                        </span>
                      )}
                    </div>
                  )}
                  {u.url ? (
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-fast-goal="original_link_click"
                      data-fast-goal-framework={f.id}
                      data-fast-goal-authority={u.src}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
                    >
                      {lang === "de" ? "Original öffnen" : "Open original"}: {u.src} ↗
                    </a>
                  ) : (
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      title={lang === "de" ? "Beispieldatensatz, kein echtes Dokument" : "Sample record, not a real document"}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 underline-offset-2 hover:underline"
                    >
                      {lang === "de" ? "Beispieldatensatz" : "Sample record"}: {u.src}
                    </a>
                  )}
                  {u.adv?.length ? (
                    <div className="mt-3 border-t border-slate-100 pt-2.5">
                      <span className="text-[0.6875rem] font-medium text-slate-400">
                        {lang === "de"
                          ? "So kommentieren Big 4 & Kanzleien:"
                          : "Big 4 & law firm commentary:"}
                      </span>
                      <ul className="mt-1.5 space-y-1">
                        {u.adv.map((a) => (
                          <li key={a.url}>
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group -mx-2 flex items-start gap-4 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                            >
                              <span className="flex w-20 shrink-0 items-center pt-px">
                                <FirmLogo firm={a.f} />
                              </span>
                              <span className="min-w-0 flex-1 text-xs leading-snug text-slate-600 group-hover:text-slate-900">
                                {a.ti}
                              </span>
                              {a.d && (
                                <span className="num shrink-0 text-xs text-slate-400">
                                  {fmtDate(lang, a.d)}
                                </span>
                              )}
                              <span
                                aria-hidden
                                className="shrink-0 text-xs text-slate-400 group-hover:text-slate-900"
                              >
                                ↗
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  </article>
                </div>
              );
            })}
          </div>

          {/* Seitenleiste */}
          <aside className="space-y-3 lg:sticky lg:top-24">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold tracking-tight">
                {lang === "de" ? "Auf einen Blick" : "At a glance"}
              </h2>
              <dl className="mt-2.5 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{lang === "de" ? "Thema" : "Topic"}</dt>
                  <dd className="text-right">{tx(lang, t.n)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{lang === "de" ? "Jurisdiktion" : "Jurisdiction"}</dt>
                  <dd className="text-right">{f.jur}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{lang === "de" ? "Gilt für" : "Applies to"}</dt>
                  <dd className="num text-right">
                    {f.ents.length} {lang === "de" ? "Anbietertypen" : "provider types"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">{lang === "de" ? "Quellen" : "Sources"}</dt>
                  <dd className="flex flex-wrap justify-end gap-x-2.5 gap-y-1 text-right">
                    {sources.map((s) => (
                      <AuthorityLogo key={s} src={s} className="h-3" />
                    ))}
                  </dd>
                </div>
              </dl>
            </div>

            {siblings.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold tracking-tight">
                  {lang === "de" ? "Weiteres zu diesem Thema" : "More on this topic"}
                </h2>
                <ul className="mt-2 space-y-0.5">
                  {siblings.map((x) => (
                    <li key={x.id}>
                      <Link
                        href={`/r/${provider}/f/${x.id}`}
                        className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        <span className="num shrink-0 text-xs text-slate-400">
                          {fmtDate(lang, x.latest)}
                        </span>
                        <span className="text-slate-700">{tx(lang, x.n)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>

      <Footer />
    </>
  );
}
