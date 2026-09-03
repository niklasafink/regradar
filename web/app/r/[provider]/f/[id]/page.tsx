"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AuthorityLogo, FirmLogo, FRAMEWORK_AUTH } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { ABOUT_LONG } from "@/lib/data";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
} from "@/components/ui/carousel";
import {
  childrenOf, daysAgo, daysUntil, deadlineExpired, deadlineLabel, dt, fmtDate, frameworkById,
  parentOf, providerById, topicById, tx, visibleFrameworks,
} from "@/lib/logic";
import { firstParagraph, updateHref } from "@/lib/updates";
import { useStore } from "@/lib/store";
import { useState } from "react";
import type { Framework, Update } from "@/lib/data";

export default function FrameworkDetail() {
  const { provider, id } = useParams<{ provider: string; id: string }>();
  const { lang } = useStore();

  const p = providerById(provider);
  const f = frameworkById(id);
  if (!p || !f) notFound();
  const t = topicById(f.topic)!;

  const parent = parentOf(f);
  const kids = visibleFrameworks(p.id, null).filter((x) => x.parent === f.id);
  const siblings = visibleFrameworks(p.id, null)
    .filter((x) => x.topic === f.topic && x.id !== f.id && !x.parent);

  // Slider als Filter: „Alle" (Hauptstandard + alle Unterrahmenwerke), der
  // Hauptstandard selbst oder ein einzelnes Unterrahmenwerk.
  const [sel, setSel] = useState<string>(kids.length > 0 ? "all" : f.id);
  const shortName = (x: Framework) =>
    x.sn ? tx(lang, x.sn) : tx(lang, x.n).split(":")[0].trim();
  const scope: Framework[] =
    sel === "all" ? [f, ...kids] : sel === f.id ? [f] : kids.filter((k) => k.id === sel);
  const ups: { u: Update; owner: Framework }[] = scope
    .flatMap((owner) => owner.u.map((u) => ({ u, owner })))
    .sort((a, b) => dt(b.u.d).getTime() - dt(a.u.d).getTime());
  const fresh = ups.filter(({ u }) => daysAgo(u.d) <= 30).length;
  const sources = [...new Set(ups.map(({ u }) => u.src))];
  const tileCount = kids.length > 0 ? kids.length + 2 : 0;
  const tile = (active: boolean) =>
    `flex w-64 items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
      active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white hover:border-slate-900"
    }`;


  return (
    <>
      <Chrome />

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* Kopf, kompakt: Rücksprung, Thema und Bedingungen in einer Zeile */}
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <Link
            href={`/r/${p.slug}`}
            className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-900"
          >
            <span aria-hidden>←</span>
            {lang === "de" ? "Übersicht" : "Overview"}
          </Link>
          <span className="rounded-full bg-slate-100 px-3 py-0.5 font-medium text-slate-600">
            {tx(lang, t.n)}
          </span>
          {f.condL && (
            <span className="rounded-full border border-slate-200 px-3 py-0.5 font-medium text-slate-500">
              {tx(lang, f.condL)}
            </span>
          )}
          {parent && (
            <Link
              href={`/r/${p.slug}/f/${parent.id}`}
              className="rounded-full border border-slate-900 px-3 py-0.5 font-medium text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
            >
              {lang === "de" ? "Konkretisiert" : "Specifies"}: {tx(lang, parent.n)}
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AuthorityLogo
            src={FRAMEWORK_AUTH[f.id] ?? f.u[0]?.src ?? "eur-lex.europa.eu"}
            className="h-5"
          />
          <p className="text-sm text-slate-400">
            {f.refUrl ? (
              <a
                href={f.refUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-slate-900 hover:underline"
              >
                {f.ref} ↗
              </a>
            ) : (
              f.ref
            )}
            , {f.jur}
          </p>
        </div>
        <h1 className="font-heading mt-1.5 max-w-4xl text-balance text-2xl font-medium tracking-tight sm:text-3xl">
          {tx(lang, f.n)}
        </h1>

        {/* Kennzahlen als eine Zeile statt Kachelraster */}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            <span className="num font-semibold text-slate-900">{ups.length}</span>{" "}
            {lang === "de" ? "Updates" : "updates"}
          </span>
          <span>
            <span className="num font-semibold text-slate-900">{fresh}</span>{" "}
            {lang === "de" ? "in den letzten 30 Tagen" : "in the last 30 days"}
          </span>
          {ups[0] && (
            <span>
              {lang === "de" ? "Stand" : "Updated"}{" "}
              <span className="num font-semibold text-slate-900">{fmtDate(lang, ups[0].u.d)}</span>
            </span>
          )}
          {ups.length > 1 && (
            <span>
              {lang === "de" ? "seit" : "since"}{" "}
              <span className="num font-semibold text-slate-900">{fmtDate(lang, ups[ups.length - 1].u.d)}</span>
            </span>
          )}
        </p>
        {ABOUT_LONG[f.id] && (
          <details className="group mt-2 max-w-3xl">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-900 underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
              {lang === "de" ? "Mehr zum Rahmenwerk" : "More about this framework"}
              <ChevronDown
                aria-hidden
                className="size-3.5 text-slate-400 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-2 space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-600">
              {ABOUT_LONG[f.id].map((para, i) => (
                <p key={i}>{tx(lang, para)}</p>
              ))}
            </div>
          </details>
        )}

        {/* Slider als Filter: Alle, Hauptstandard, je ein Unterrahmenwerk */}
        {kids.length > 0 && (
          <Carousel opts={{ align: "start" }} className="mt-5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
            <CarouselContent>
              <CarouselItem className="basis-auto">
                <button
                  type="button"
                  aria-pressed={sel === "all"}
                  onClick={() => setSel("all")}
                  className={tile(sel === "all").replace("w-64", "w-auto")}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight">
                      {lang === "de" ? "Alle" : "All"}
                    </span>
                    <span className={`num block text-xs ${sel === "all" ? "text-slate-300" : "text-slate-400"}`}>
                      {[f, ...kids].reduce((n, x) => n + x.u.length, 0)} Updates
                    </span>
                  </span>
                </button>
              </CarouselItem>
              {[f, ...kids].map((k) => {
                const active = sel === k.id;
                return (
                  <CarouselItem key={k.id} className="basis-auto">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSel(k.id)}
                      className={tile(active)}
                    >
                      <AuthorityLogo
                        src={FRAMEWORK_AUTH[k.id] ?? k.u[0]?.src ?? "eur-lex.europa.eu"}
                        className={`h-4 shrink-0 ${active ? "invert" : ""}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold tracking-tight">
                          {shortName(k)}
                        </span>
                        <span className={`num block truncate text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>
                          {k.ref}
                        </span>
                      </span>
                      {daysAgo(k.u[0]?.d ?? "01.01.2020") <= 14 && (
                        <span className="ml-auto shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[0.6875rem] font-medium text-white">
                          {lang === "de" ? "Neu" : "New"}
                        </span>
                      )}
                    </button>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            </div>
            {tileCount > 3 && (
              <div className="flex shrink-0 gap-1.5">
                <CarouselPrevious aria-label={lang === "de" ? "Zurück" : "Previous"} />
                <CarouselNext aria-label={lang === "de" ? "Weiter" : "Next"} />
              </div>
            )}
          </Carousel>
        )}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          {/* Update-Verlauf als Zeitleiste */}
          <div>
            {ups.length === 0 && (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-500">
                {lang === "de"
                  ? "Für diese Auswahl liegen noch keine Updates vor. Neue Meldungen aus den Primärquellen erscheinen hier automatisch."
                  : "No updates for this selection yet. New releases from the primary sources will appear here automatically."}
              </p>
            )}
            {ups.map(({ u, owner }, i) => {
              const isNew = daysAgo(u.d) <= 14;
              const expired = !!u.deadline && deadlineExpired(u.deadline);
              const urgent = u.deadline && !expired && daysUntil(u.deadline) < 60;
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
                    {sel === "all" && owner.id !== f.id && (
                      <button
                        type="button"
                        onClick={() => setSel(owner.id)}
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-500 hover:border-slate-900 hover:text-slate-900"
                      >
                        {shortName(owner)}
                      </button>
                    )}
                  </div>
                  <h2 className="mt-2 text-sm font-semibold tracking-tight">
                    <Link
                      href={updateHref(owner.id, u)}
                      className="underline-offset-2 hover:underline"
                    >
                      {tx(lang, u.ti)}
                    </Link>
                  </h2>
                  {tx(lang, u.s) && (
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                      {firstParagraph(tx(lang, u.s))}
                    </p>
                  )}
                  {(u.deadline || u.eff) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
                      {u.deadline && (
                        <span className={`num ${urgent ? "font-medium text-red-600" : expired ? "text-slate-400" : "text-slate-600"}`}>
                          {deadlineLabel(lang, u.deadline)}
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
                      data-fast-goal-framework={owner.id}
                      data-fast-goal-authority={u.src}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
                    >
                      {lang === "de" ? "Original öffnen" : "Open original"}: {u.src} ↗
                    </a>
                  ) : (
                    <span
                      title={lang === "de" ? "Redaktioneller Eintrag ohne Direktlink zur Primärquelle" : "Editorial entry without a direct link to the primary source"}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400"
                    >
                      {lang === "de" ? "Quelle" : "Source"}: {u.src}
                    </span>
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
                        href={`/r/${p.slug}/f/${x.id}`}
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
