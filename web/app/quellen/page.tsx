"use client";

import { AuthorityLogo } from "@/components/authority-logo";
import { Chrome, Footer } from "@/components/chrome";
import { TrackGoal } from "@/components/track-goal";
import { useStore } from "@/lib/store";
import {
  JURISDICTION_LABEL,
  JURISDICTIONS,
  SOURCES,
  SOURCES_GENERATED_AT,
  type Source,
} from "@/lib/sources";

/** Zugriffsweg -> Anzeige-Label */
const ACCESS_LABEL: Record<string, string> = {
  RSS: "RSS-Feed",
  API: "API",
  XML: "XML",
  SITEMAP: "Sitemap",
  HTML: "HTML",
};

const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function SourceRow({ s }: { s: Source }) {
  return (
    <li className="flex items-center gap-4 py-3">
      <span className="hidden w-24 shrink-0 sm:block">
        <AuthorityLogo src={domainOf(s.url)} decorative className="h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          data-fast-goal="source_click"
          data-fast-goal-source={s.id}
          data-fast-goal-placement="quellen"
          className="text-sm font-medium text-slate-900 hover:underline hover:underline-offset-2"
        >
          {s.name}
        </a>
        <span className="mt-0.5 block truncate text-xs text-slate-400">
          {domainOf(s.url)}
        </span>
      </span>
      <span className="hidden shrink-0 text-xs text-slate-500 md:block">
        {s.authority}
      </span>
      <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
        {ACCESS_LABEL[s.access] ?? s.access}
      </span>
    </li>
  );
}

export default function Quellen() {
  const { lang } = useStore();
  const updated = new Date(SOURCES_GENERATED_AT).toLocaleDateString(
    lang === "de" ? "de-DE" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <>
      <TrackGoal goal="quellen_screen_viewed" />
      <Chrome />

      <main className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <div className="pt-10">
          <h1 className="font-heading text-3xl font-medium tracking-tight">
            {lang === "de" ? "Angebundene Quellen" : "Connected sources"}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
            {lang === "de"
              ? `Regulatory Radar wertet derzeit ${SOURCES.length} öffentliche Primärquellen automatisiert aus – Gesetzgebung, Aufsichtsbehörden und internationale Standardsetzer. Verlinkt wird immer auf das Originaldokument der jeweiligen Quelle. Diese Liste wird bei jedem Datenabgleich automatisch aktualisiert.`
              : `Regulatory Radar currently monitors ${SOURCES.length} public primary sources automatically – legislation, supervisory authorities and international standard setters. Every update links to the original document at its source. This list is refreshed automatically with every data sync.`}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {lang === "de" ? `Stand: ${updated}` : `Last updated: ${updated}`}
          </p>
        </div>

        {JURISDICTIONS.map((j) => {
          const group = SOURCES.filter((s) => s.jurisdiction === j);
          if (!group.length) return null;
          return (
            <section key={j} className="mt-12">
              <div className="flex items-baseline gap-3">
                <h2 className="font-heading text-lg font-medium tracking-tight">
                  {JURISDICTION_LABEL[j][lang]}
                </h2>
                <span className="num text-xs text-slate-400">
                  {group.length}{" "}
                  {group.length === 1 ? (lang === "de" ? "Quelle" : "source") : lang === "de" ? "Quellen" : "sources"}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                {group.map((s) => (
                  <SourceRow key={s.id} s={s} />
                ))}
              </ul>
            </section>
          );
        })}

        <p className="mt-12 max-w-2xl text-xs leading-relaxed text-slate-400">
          {lang === "de"
            ? "Ausschließlich öffentlich zugängliche Quellen; lizenzpflichtige Verbandsinhalte und Quellen mit Bot-Schutz werden nicht angebunden. Fehlt eine Quelle? Hinweise gern per E-Mail (siehe Impressum)."
            : "Only publicly accessible sources; licensed association content and bot-protected sources are not connected. Missing a source? Suggestions welcome by email (see legal notice)."}
        </p>
      </main>

      <Footer />
    </>
  );
}
