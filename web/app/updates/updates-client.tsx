"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { SearchBox } from "@/components/search";
import { PRAXIS_CAT_LABELS, PROVIDERS, type PraxisItem, type Txt } from "@/lib/base";
import {
  daysAgo, daysUntil, dt, deadlineExpired, deadlineLabel, fmtDate, IMPACT_LABEL, impactOf,
  PROVIDER_SHORT, tx, type Impact,
} from "@/lib/core";
import { activeName, hasProfile, relMatches, useMe, useRelevance, useRelFilter } from "@/lib/relevanceClient";
import { RelevanceFilter } from "@/components/relevance-filter";
import { RelevanceChip } from "@/components/relevance-chip";
import { ExportButton } from "@/components/export-dialog";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";
import { Timeline, type TlItem } from "./timeline";

/** Update-Zeile mit den angezeigten Feldern (vom Server vorbereitet, page.tsx). */
export interface UpdateRow {
  slug: string;
  fw: { ents: string[]; n: Txt };
  u: { d: string; src: string; t: Txt; ti: Txt; deadline?: string; eff?: string; imp?: Impact };
}

const impactPill = (i: Impact) =>
  `inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
    i === "high"
      ? "bg-slate-900 text-white"
      : i === "medium"
        ? "border border-slate-300 text-slate-700"
        : "border border-slate-200 text-slate-400"
  }`;

/** Kompakte Übergabe vom Server: Rahmenwerke einmal, Zeilen verweisen per Index. */
export interface UpdatesData {
  fws: UpdateRow["fw"][];
  rows: (Omit<UpdateRow, "fw"> & { f: number })[];
  praxis: PraxisItem[];
}

type Art = "updates" | "praxis" | "alle";
type View = "liste" | "zeitachse";

/** Nächstes anstehendes Datum (Anwendungsbeginn oder Konsultationsfrist), sonst null. */
function upcoming(u: UpdateRow["u"]): { date: string; kind: "eff" | "deadline" } | null {
  const c: { date: string; kind: "eff" | "deadline" }[] = [];
  if (u.eff && daysUntil(u.eff) >= 0) c.push({ date: u.eff, kind: "eff" });
  if (u.deadline && daysUntil(u.deadline) >= 0) c.push({ date: u.deadline, kind: "deadline" });
  c.sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime());
  return c[0] ?? null;
}

export function AllUpdates({ fws, rows, praxis }: UpdatesData) {
  const UPDATE_PAGES: UpdateRow[] = useMemo(
    () => rows.map(({ f, ...r }) => ({ ...r, fw: fws[f] })),
    [fws, rows],
  );
  const { lang } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [art, setArt] = useState<Art>("updates");
  const [future, setFuture] = useState(false);
  const [view, setView] = useState<View>("liste");

  /* Vorauswahl der Zielgruppe über ?type=, z. B. vom Board aus verlinkt. */
  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("type");
    // Sprechender Slug ("bank") ist kanonisch, alte ID-Links ("CI") bleiben gültig.
    const match = type ? PROVIDERS.find((p) => p.slug === type || p.id === type) : undefined;
    if (match) setSel(match.id);
    track("updates_screen_viewed");
  }, []);

  const byInst = sel
    ? UPDATE_PAGES.filter((p) => p.fw.ents.includes(sel))
    : UPDATE_PAGES;
  // „Zukünftige Normen“: Anwendungsbeginn oder Frist liegt noch vor uns
  const futureCount = byInst.filter((p) => upcoming(p.u)).length;
  const showUpdates = art !== "praxis";
  const showPraxis = art !== "updates";
  const byType = !showUpdates ? [] : future ? byInst.filter((p) => upcoming(p.u)) : byInst;

  // Einschlägigkeit für das Profil des Besuchers: volle Prüfung nur für die
  // obersten Einträge; für den Filter fragen wir den Rest ohne KI ab
  // (Regeln und gespeicherte Ergebnisse).
  const me = useMe();
  const withProfile = hasProfile(me);
  const [relFilter, setRelFilter] = useRelFilter();
  const typeKeys = byType.map((p) => `u:${p.slug}`);
  const rel = useRelevance(typeKeys.slice(0, 40), withProfile, typeKeys);
  const relName = activeName(me);
  const shownUpdates = withProfile ? byType.filter((p) => relMatches(relFilter, rel[`u:${p.slug}`])) : byType;
  // Praxis-Meldungen haben kein Rahmenwerk und keine Zielgruppe: Zielgruppen- und
  // Einschlägigkeitsfilter gelten nur für Updates. Mit „Zukünftige Normen“ gibt es keine Praxis.
  const shownPraxis = showPraxis && !future ? praxis : [];
  const shown = shownUpdates;
  const total = shownUpdates.length + shownPraxis.length;
  const praxisNote =
    showPraxis && !future && (sel !== null || (withProfile && relFilter !== "alle"));

  type ListItem =
    | { t: "u"; date: string; up: ReturnType<typeof upcoming>; row: UpdateRow }
    | { t: "p"; date: string; p: PraxisItem };
  const listItems = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [
      ...shownUpdates.map((row): ListItem => {
        const up = future ? upcoming(row.u) : null;
        return { t: "u", date: up ? up.date : row.u.d, up, row };
      }),
      ...shownPraxis.map((p): ListItem => ({ t: "p", date: p.d, p })),
    ];
    // Zukunft: nächster Termin zuerst, sonst neueste zuerst
    out.sort((a, b) => future
      ? dt(a.date).getTime() - dt(b.date).getTime()
      : dt(b.date).getTime() - dt(a.date).getTime());
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUpdates, shownPraxis, future]);

  const tlItems = useMemo<TlItem[]>(() => {
    const out: TlItem[] = [];
    for (const { slug, fw, u } of shownUpdates) {
      const sub = `${tx(lang, fw.n)}, ${tx(lang, u.t)}`;
      const base = { href: `/u/${slug}`, title: tx(lang, u.ti), sub, src: u.src, impact: impactOf(u) };
      if (!future) out.push({ ...base, key: slug, date: u.d, kind: "update" });
      if (u.eff && daysUntil(u.eff) >= 0) out.push({ ...base, key: `${slug}:eff`, date: u.eff, kind: "eff" });
      if (u.deadline && daysUntil(u.deadline) >= 0) out.push({ ...base, key: `${slug}:dl`, date: u.deadline, kind: "deadline" });
    }
    for (const p of shownPraxis) {
      out.push({
        key: `${p.url}-${p.d}`, href: p.url, external: true, date: p.d, title: p.ti,
        sub: p.auth, src: p.src, kind: "praxis", tag: PRAXIS_CAT_LABELS[p.cat][lang],
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUpdates, shownPraxis, future, lang]);

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
          <p className="num shrink-0 text-sm text-slate-500">
            {total} {lang === "de" ? "Einträge" : "entries"}
          </p>
          <ExportButton me={me} scope={{ art, future, inst: sel }} />
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

        {/* Art, zukünftige Normen und Ansicht; kombinierbar mit allen Filtern oben */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <nav className="contents" aria-label={lang === "de" ? "Art der Meldung" : "Type of item"}>
            {([
              ["updates", lang === "de" ? "Updates" : "Updates", null],
              ["praxis", lang === "de" ? "Praxis" : "Enforcement", praxis.length],
              ["alle", lang === "de" ? "Updates und Praxis" : "Both", null],
            ] as [Art, string, number | null][]).map(([v, label, n]) => (
              <button
                key={v}
                type="button"
                className={pill(art === v)}
                aria-pressed={art === v}
                onClick={() => {
                  setArt(v);
                  if (v === "praxis") setFuture(false);
                }}
              >
                {label}
                {n !== null && <span className="num text-xs opacity-70">{n}</span>}
              </button>
            ))}
          </nav>
          <span aria-hidden className="mx-1 h-4 w-px bg-slate-200" />
          <button
            type="button"
            className={pill(future)}
            aria-pressed={future}
            disabled={art === "praxis"}
            title={art === "praxis" ? (lang === "de" ? "Gilt nur für Updates" : "Applies to updates only") : undefined}
            onClick={() => {
              if (!future) track("future_norms_filter");
              setFuture(!future);
            }}
          >
            {lang === "de" ? "Zukünftige Normen" : "Upcoming rules"}
            <span className="num text-xs opacity-70">{futureCount}</span>
          </button>
          <RelevanceFilter
            variant="dropdown"
            keys={typeKeys}
            rel={rel}
            value={relFilter}
            onChange={setRelFilter}
            show={withProfile}
          />
          <span className="min-w-0 flex-1" />
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label={lang === "de" ? "Ansicht" : "View"}>
            {(["liste", "zeitachse"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  if (view !== v) track("updates_view_changed", { view: v });
                  setView(v);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {v === "liste" ? (lang === "de" ? "Liste" : "List") : (lang === "de" ? "Zeitachse" : "Timeline")}
              </button>
            ))}
          </div>
        </div>

        {praxisNote && (
          <p className="mt-3 text-xs text-slate-400">
            {lang === "de"
              ? "Praxis-Meldungen gehören keinem Institutstyp an und werden nicht nach Einschlägigkeit bewertet; diese Filter gelten nur für Updates."
              : "Enforcement items are not tied to an institution type or rated for relevance; those filters apply to updates only."}
          </p>
        )}

        {withProfile && relFilter !== "alle" && showUpdates && total === 0 && (
          <p className="py-16 text-center text-sm text-slate-500">
            Keine geprüften Einträge mit diesem Status{relName ? ` für ${relName}` : ""}.
          </p>
        )}

        {view === "zeitachse" ? (
          <Timeline items={tlItems} lang={lang} />
        ) : (
        /* Chronologische Liste mit Zeitlinie */
        <ol className="mt-6">
          {listItems.map((item) => {
            if (item.t === "p") {
              const p = item.p;
              return (
                <li key={`p:${p.url}-${p.d}`}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5rem_1rem_minmax(0,1fr)_10.5rem] sm:gap-x-4"
                  >
                    <span className="num pt-2.5 text-right text-xs text-slate-500">{fmtDate(lang, p.d)}</span>
                    <span aria-hidden className="relative flex justify-center">
                      <span className="absolute inset-y-0 w-px bg-slate-200" />
                      <span className="relative mt-3 size-2 rounded-[2px] border border-slate-400 bg-white" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 border-b border-slate-50 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <AuthorityLogo src={p.src} className="h-3.5 shrink-0" />
                        <span className="truncate text-sm font-medium text-slate-900 group-hover:underline group-hover:underline-offset-2">
                          {p.ti}
                        </span>
                      </span>
                      <span className="truncate text-xs text-slate-500">
                        {lang === "de" ? "Aufsichtspraxis" : "Enforcement practice"}, {p.auth}
                      </span>
                    </span>
                    <span className="hidden flex-col items-end gap-1 border-b border-slate-50 py-2.5 sm:flex">
                      <span className="inline-flex shrink-0 items-center rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                        {PRAXIS_CAT_LABELS[p.cat][lang]}
                      </span>
                    </span>
                  </a>
                </li>
              );
            }
            const { slug, fw, u } = item.row;
            const up = item.up;
            const fresh = daysAgo(u.d) <= 14;
            const expired = !!u.deadline && deadlineExpired(u.deadline);
            const urgent = u.deadline && !expired && daysUntil(u.deadline) < 60;
            const impact = impactOf(u);
            const r = rel[`u:${slug}`];
            return (
              <li key={slug}>
                <Link
                  href={`/u/${slug}`}
                  className="group grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5rem_1rem_minmax(0,1fr)_10.5rem] sm:gap-x-4"
                >
                  {/* Datum links; bei „Zukünftige Normen“ der anstehende Termin */}
                  <span className="num pt-2.5 text-right text-xs text-slate-500">
                    {fmtDate(lang, item.date)}
                  </span>

                  {/* Zeitlinie */}
                  <span aria-hidden className="relative flex justify-center">
                    <span className="absolute inset-y-0 w-px bg-slate-200" />
                    <span
                      className={`relative mt-3 size-2 rounded-full ${
                        up ? "border border-dashed border-slate-400 bg-white" : fresh ? "bg-blue-600" : "border border-slate-300 bg-white"
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
                      {r && (
                        <span className="sm:hidden"><RelevanceChip r={r} name={relName} /></span>
                      )}
                      <span className="truncate">
                        {tx(lang, fw.n)}, {tx(lang, u.t)}
                      </span>
                      {up && (
                        <span className="num whitespace-nowrap font-medium text-slate-700">
                          {up.kind === "eff"
                            ? `${lang === "de" ? "Gilt ab" : "Applies from"} ${fmtDate(lang, up.date)}`
                            : `${lang === "de" ? "Frist" : "Deadline"} ${fmtDate(lang, up.date)}`}
                          {`, ${lang === "de" ? "veröffentlicht" : "published"} ${fmtDate(lang, u.d)}`}
                        </span>
                      )}
                      {!up && u.deadline && (
                        <span className={`num whitespace-nowrap ${urgent ? "font-medium text-red-600" : expired ? "text-slate-400" : ""}`}>
                          {expired
                            ? deadlineLabel(lang, u.deadline)
                            : `${lang === "de" ? "Frist" : "Deadline"} ${fmtDate(lang, u.deadline)}`}
                        </span>
                      )}
                    </span>
                  </span>

                  {/* Impact rechts */}
                  <span className="hidden flex-col items-end gap-1 border-b border-slate-50 py-2.5 sm:flex">
                    <span className={impactPill(impact)}>
                      Impact: {tx(lang, IMPACT_LABEL[impact])}
                    </span>
                    {r && (
                      <RelevanceChip r={r} name={relName} />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        )}

        <p className="mt-10 text-xs text-slate-400">
          {lang === "de"
            ? "Die Impact-Einschätzung ist eine automatische, KI-gestützte Einordnung nach Inhalt, Dokumenttyp und Frist. Keine Rechtsberatung."
            : "The impact rating is an automatic, AI-assisted classification based on content, document type and deadline. Not legal advice."}
        </p>
      </main>

      <Footer />
    </>
  );
}
