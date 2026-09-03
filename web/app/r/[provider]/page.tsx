"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { AuthorityLogo, FRAMEWORK_AUTH } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { SearchBox } from "@/components/search";
import {
  childrenOf, daysAgo, fmtDate, providerById, topicsWithContent, tx, visibleFrameworks,
} from "@/lib/logic";
import { useStore } from "@/lib/store";

export default function Board() {
  const { provider } = useParams<{ provider: string }>();
  const { lang } = useStore();
  const [selected, setSelected] = useState<string[]>([]);

  const p = providerById(provider);
  if (!p) notFound();

  // Konkretisierende Vorgaben (Kinder) erscheinen nur als Chips auf der Elternkachel;
  // die Kennzahlen zählen sie mit (wie auf der Startseite).
  const all = visibleFrameworks(p.id, null);
  const list = all.filter((f) => !f.parent);
  const topics = topicsWithContent(list);
  const shown = selected.length ? topics.filter((t) => selected.includes(t.id)) : topics;
  const totalUpdates = all.reduce((n, f) => n + f.u.length, 0);

  const toggleTopic = (id: string) => {
    if (id === "ALL") return setSelected([]);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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
        {/* Kopfbereich */}
        <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
          <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">
            {tx(lang, p.n)}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <p className="num text-sm text-slate-500">
              {all.length} {lang === "de" ? "Rahmenwerke" : "frameworks"}, {totalUpdates} Updates
            </p>
            <SearchBox provider={p.id} />
          </div>
        </div>

        {/* Filterleiste */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5">
            <span className="rounded-full bg-slate-900 px-3.5 py-1 text-xs font-medium text-white">
              {lang === "de" ? "Rahmenwerke" : "Frameworks"}
            </span>
            <Link
              href={`/updates?type=${p.slug}`}
              className="rounded-full px-3.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              {lang === "de" ? "Alle Updates" : "All updates"}
            </Link>
          </div>
        </div>

        {/* Themenfilter */}
        <nav
          className="mt-4 flex flex-wrap items-center gap-1.5"
          aria-label={lang === "de" ? "Themenbereiche" : "Topics"}
        >
          <button
            type="button"
            className={pill(selected.length === 0)}
            aria-pressed={selected.length === 0}
            onClick={() => toggleTopic("ALL")}
          >
            {lang === "de" ? "Alle Themen" : "All topics"}
            <span className="num text-xs opacity-70">{list.length}</span>
          </button>
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              className={pill(selected.includes(t.id))}
              aria-pressed={selected.includes(t.id)}
              onClick={() => toggleTopic(t.id)}
            >
              {tx(lang, t.n)}
              <span className="num text-xs opacity-70">{t.fws.length}</span>
            </button>
          ))}
        </nav>

        {shown.length === 0 && (
          <p className="py-20 text-center text-sm text-slate-500">
            {lang === "de"
              ? "Für diesen Anbietertyp sind keine Rahmenwerke hinterlegt."
              : "No frameworks are recorded for this provider type."}
          </p>
        )}

        {shown.map((t) => (
          <section key={t.id} className="mt-10">
            <h2 className="font-heading text-lg font-medium tracking-tight">{tx(lang, t.n)}</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {t.fws.map((f) => {
                const fresh = daysAgo(f.latest) <= 14;
                const kids = childrenOf(f.id);
                return (
                  <Link
                    key={f.id}
                    href={`/r/${p.slug}/f/${f.id}`}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgb(31_30_26/0.04),0_4px_14px_rgb(31_30_26/0.07)] transition-all hover:border-slate-900 hover:shadow-[0_2px_4px_rgb(31_30_26/0.05),0_8px_24px_rgb(31_30_26/0.1)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <AuthorityLogo
                          src={FRAMEWORK_AUTH[f.id] ?? f.u[0]?.src ?? "eur-lex.europa.eu"}
                          className="mb-2.5 h-5"
                        />
                        <h3 className="text-sm font-semibold tracking-tight">{tx(lang, f.n)}</h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {f.ref}, {f.jur}
                        </p>
                      </div>
                      {fresh && (
                        <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">
                          {lang === "de" ? "Neu" : "New"}
                        </span>
                      )}
                    </div>
                    {kids.length > 0 && (
                      <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="shrink-0">
                          {lang === "de" ? "Konkretisiert durch:" : "Specified by:"}
                        </span>
                        {kids.map((k) => (
                          <span
                            key={k.id}
                            className="rounded-full border border-slate-200 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600"
                          >
                            {tx(lang, k.sn ?? k.n)}
                          </span>
                        ))}
                      </p>
                    )}
                    <div className="mt-3 flex flex-1 items-end justify-between border-t border-slate-100 pt-2.5 text-xs">
                      <span className="num text-slate-400">
                        {f.u.length === 0
                          ? lang === "de" ? "Neu angebunden" : "Newly connected"
                          : `${lang === "de" ? "Stand" : "Updated"} ${fmtDate(lang, f.latest)}`}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                        {lang === "de"
                          ? `Alle ${f.u.length} Updates`
                          : `All ${f.u.length} updates`}
                        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                          →
                        </span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <Footer />
    </>
  );
}
