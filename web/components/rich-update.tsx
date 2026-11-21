import { Patrick_Hand } from "next/font/google";
import { Sketch } from "@/components/sketch";
import type { TocItem } from "@/components/toc";
import type { RichAudience, RichImpactAnalysis, RichImpactItem, RichUpdate } from "@/lib/rich";

// Handschrift nur für die Strichgrafik des Zeitplans (zeigt einen Ablauf).
const hand = Patrick_Hand({ subsets: ["latin"], weight: "400", variable: "--font-hand" });

const SK = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
const handText = { fontFamily: "var(--font-hand), 'Comic Sans MS', cursive" } as const;

/** Zeitstrahl: Strichgrafik, die den zeitlichen Ablauf zeigt. */
function Timeline({ items, seed }: { items: RichUpdate["timeline"]; seed: number }) {
  const n = items.length;
  const xs = items.map((_, i) => (n > 1 ? 70 + i * (660 / (n - 1)) : 400));
  return (
    <Sketch seed={seed}>
      <svg viewBox="0 0 800 200" role="img" aria-label="Zeitstrahl" className="block h-auto w-full min-w-[560px] text-slate-900" style={handText}>
        <path className="sk arrow" data-w="2" d="M 30 100 L 785 100" {...SK} />
        {items.map((t, i) => {
          const x = xs[i];
          const tone = t.kind === "kern" || t.kind === "frist";
          const stroke = t.kind === "kern" ? "text-blue-600" : t.kind === "frist" ? "text-red-600" : "";
          const fill = t.kind === "kern" ? "fill-blue-600" : t.kind === "frist" ? "fill-red-600" : "fill-slate-900";
          const above = i % 2 === 0;
          let anchor: "start" | "middle" | "end" = "middle";
          let ax = x;
          if (n > 1 && i === 0) [anchor, ax] = ["start", x - 30];
          if (n > 1 && i === n - 1) [anchor, ax] = ["end", Math.min(x + 40, 790)];
          const [dy, ly] = above ? [58, 80] : [142, 164];
          return (
            <g key={t.date + i}>
              <circle className={`sk ${stroke}`} data-fill="" data-w="2" cx={x} cy={100} r={tone ? 11 : 7} {...SK} />
              <text x={ax} y={dy} textAnchor={anchor} style={{ fontSize: 20 }} className={fill}>{t.date}</text>
              <text x={ax} y={ly} textAnchor={anchor} style={{ fontSize: 16 }} className="fill-slate-500">{t.label}</text>
            </g>
          );
        })}
        <text x={785} y={192} textAnchor="end" style={{ fontSize: 14 }} className="fill-slate-400">nicht maßstabsgetreu</text>
      </svg>
    </Sketch>
  );
}

/** Kurzfassung in Stichpunkten: jeder Satz ein Punkt. */
function bullets(s: string): string[] {
  return s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
}

const hasImpact = (ia?: RichImpactAnalysis) =>
  !!ia && (ia.controls.length + ia.processes.length + ia.policies.length > 0);

/** Einträge der Gliederung rechts, passend zu den Abschnitten unten. */
export function richToc(rich: RichUpdate): TocItem[] {
  const ia = rich.impact_analysis;
  return [
    { id: "kurz", label: "Kurz gesagt" },
    { id: "relevanz", label: "Für wen relevant" },
    { id: "worum", label: "Worum es geht" },
    { id: "aenderungen", label: "Was sich ändert" },
    ...(hasImpact(ia) ? [{ id: "impact", label: "Impact-Analyse" }] : []),
    ...(hasImpact(ia) ? [] : [{ id: "todos", label: "Was jetzt zu tun ist" }]),
    ...(rich.timeline.length >= 2 ? [{ id: "zeitplan", label: "Zeitplan" }] : []),
    { id: "faq", label: "Häufige Fragen" },
  ];
}

const H2 = "font-heading text-xl font-bold tracking-tight text-slate-900";
const SECTION = "mt-12 scroll-mt-24";
const PILL = "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium";

const STATUS_PILL: Record<RichAudience["status"], string> = {
  betroffen: "bg-slate-900 text-white",
  teilweise: "border border-slate-300 text-slate-700",
  "nicht betroffen": "border border-slate-200 text-slate-400",
};
const LOAD_PILL = {
  hoch: "bg-slate-900 text-white",
  mittel: "border border-slate-300 text-slate-700",
  gering: "border border-slate-200 text-slate-400",
} as const;

/** Tabelle mit einer Spalte je Eintrag; ab fünf Einträgen auf zwei Zeilen verteilt. */
function Grid({ n, children, className = "" }: { n: number; children: React.ReactNode; className?: string }) {
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 ${className}`}>
      <ul
        className="-mb-px -mr-px grid grid-cols-1 sm:[grid-template-columns:repeat(var(--c),minmax(0,1fr))]"
        style={{ "--c": cols } as React.CSSProperties}
      >
        {children}
      </ul>
    </div>
  );
}

const CELL = "border-b border-r border-slate-100 px-4 py-3";

function ImpactGroup({ title, items }: { title: string; items: RichImpactItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="font-heading text-lg font-medium tracking-tight text-slate-900">{title}</h3>
      {items.map((x) => (
        <div key={x.name} className="mt-4 pl-5">
          <h4 className="font-semibold text-slate-900">{x.name}</h4>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
            <li>{x.change}</li>
            {x.steps?.map((st) => <li key={st}>{st}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Angereicherte Abschnitte einer Detailseite (Server-Komponente, volles HTML für Suchmaschinen). */
export function RichUpdateSections(
  { rich, published, extra, seed }: { rich: RichUpdate; published: string; extra: { label: string; value: string }[]; seed: number },
) {
  const ia = rich.impact_analysis;
  const facts = [
    { label: "Veröffentlicht", value: published },
    ...rich.facts.filter((f) => f.label !== "Veröffentlicht"),
    ...extra,
  ];
  return (
    <div className={`${hand.variable} mt-5 text-base leading-relaxed text-slate-700`}>
      <section id="kurz" className="scroll-mt-24 rounded-2xl bg-slate-50 px-5 py-4" aria-label="Kurz gesagt">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">Kurz gesagt</h2>
        <ul className="rich-summary mt-2 list-disc space-y-1.5 pl-5">
          {bullets(rich.summary).map((b) => <li key={b.slice(0, 40)}>{b}</li>)}
        </ul>
      </section>

      {/* Eckdaten in einer Zeile; die Spalten richten sich nach der Länge des Inhalts. */}
      <dl className="mt-4 overflow-hidden rounded-2xl border border-slate-200 text-sm">
        <div className="-mb-px -mr-px grid grid-cols-2 md:flex">
          {facts.map((f) => (
            <div key={f.label} className="border-b border-r border-slate-100 px-3 py-2 md:flex-auto">
              <dt className="text-xs text-slate-500">{f.label}</dt>
              <dd className={`mt-0.5 leading-snug text-slate-900 ${f.value.length <= 24 ? "md:whitespace-nowrap" : ""}`}>{f.value}</dd>
            </div>
          ))}
        </div>
      </dl>

      <section id="relevanz" className={SECTION}>
        <h2 className={H2}>Für wen relevant</h2>
        <Grid n={rich.audience.length} className="mt-4">
          {rich.audience.map((a) => (
            <li key={a.name} className={CELL}>
              <div className="flex items-start justify-between gap-3">
                <b className="min-w-0 font-semibold leading-snug text-slate-900">{a.name}</b>
                <span className={`${PILL} shrink-0 whitespace-nowrap ${STATUS_PILL[a.status]}`}>{a.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{a.detail}</p>
            </li>
          ))}
        </Grid>
        {ia && ia.departments.length > 0 && (
          <Grid n={ia.departments.length} className="mt-3">
            {ia.departments.map((d) => (
              <li key={d.name} className={CELL}>
                <div className="flex items-start justify-between gap-3">
                  <b className="min-w-0 font-semibold leading-snug text-slate-900">{d.name}</b>
                  <span className={`${PILL} shrink-0 whitespace-nowrap ${LOAD_PILL[d.workload]}`}>Aufwand {d.workload}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{d.detail}</p>
              </li>
            ))}
          </Grid>
        )}
      </section>

      <section id="worum" className={SECTION}>
        <h2 className={H2}>Worum es geht</h2>
        <div className="mt-3 space-y-3">
          {rich.overview.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
        </div>
      </section>

      <section id="aenderungen" className={SECTION}>
        <h2 className={H2}>Was sich ändert</h2>
        <ul className="mt-3 border-t border-slate-200">
          {rich.changes.map((c) => (
            <li key={c.title} className="grid grid-cols-1 gap-1 border-b border-slate-200 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <span className="text-sm text-slate-500">{c.ref}</span>
              <div className="min-w-0">
                <b className="block font-heading font-semibold text-slate-900">{c.title}</b>
                {c.text}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {ia && hasImpact(ia) ? (
        <section id="impact" className={SECTION}>
          <h2 className={H2}>Impact-Analyse</h2>
          <ImpactGroup title="Kontrollen" items={ia.controls} />
          <ImpactGroup title="Prozesse" items={ia.processes} />
          <ImpactGroup title="Policies" items={ia.policies} />
        </section>
      ) : (
        <section id="todos" className={SECTION}>
          <h2 className={H2}>Was jetzt zu tun ist</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            {rich.todos.map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
          </ol>
        </section>
      )}

      {rich.timeline.length >= 2 && (
        <section id="zeitplan" className={SECTION}>
          <h2 className={H2}>Zeitplan</h2>
          <figure className="mt-4">
            <Timeline items={rich.timeline} seed={seed} />
            <figcaption className="mt-2 text-sm text-slate-500">Daten aus der Meldung und dem Originaldokument.</figcaption>
          </figure>
        </section>
      )}

      <section id="faq" className={SECTION}>
        <h2 className={H2}>Häufige Fragen</h2>
        <div className="mt-2">
          {rich.faq.map((q) => (
            <div key={q.q} className="mt-4">
              <h3 className="font-semibold text-slate-900">{q.q}</h3>
              <p className="mt-1">{q.a}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-10 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        Hinweis zur Erstellung und Haftung: Dieser Beitrag wurde mit Unterstützung künstlicher Intelligenz aus dem verlinkten
        Originaldokument erstellt und regelbasiert geprüft. Trotz sorgfältiger Prüfung können Fehler, Auslassungen oder
        zwischenzeitliche Rechtsänderungen nicht ausgeschlossen werden. Bitte hinterfragen Sie die Inhalte kritisch und prüfen
        Sie alle Angaben eigenverantwortlich anhand der Primärquellen, bevor Sie Entscheidungen darauf stützen. Der Beitrag
        dient ausschließlich der Information und ersetzt keine Rechtsberatung. Maßgeblich ist allein der Wortlaut der
        Originaldokumente.
      </p>
    </div>
  );
}
