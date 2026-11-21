import { Patrick_Hand } from "next/font/google";
import { Sketch } from "@/components/sketch";
import type { RichImpactItem, RichUpdate } from "@/lib/rich";

// Handschrift nur für die Strichgrafiken (wie in den Erklärvideos).
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

const H2 = "mt-10 font-heading text-xl font-medium tracking-tight text-slate-900";

function ImpactList({ title, items }: { title: string; items: RichImpactItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-2 border-t border-slate-200">
        {items.map((x) => (
          <li key={x.name} className="grid grid-cols-1 gap-1 border-b border-slate-200 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <span className="text-sm text-slate-500">{x.action}</span>
            <div className="min-w-0">
              <b className="font-semibold text-slate-900">{x.name}</b>
              <span className="block text-slate-700">{x.change}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Angereicherte Abschnitte einer Detailseite (Server-Komponente, volles HTML für Suchmaschinen). */
export function RichUpdateSections({ rich, published, seed }: { rich: RichUpdate; published: string; seed: number }) {
  const ia = rich.impact_analysis;
  return (
    <div className={`${hand.variable} mt-5 text-base leading-relaxed text-slate-700`}>
      <p className="text-lg leading-relaxed text-slate-600">{rich.lead}</p>

      {rich.facts.length > 0 && (
        <dl className="mt-6 overflow-hidden rounded-2xl border border-slate-200 text-sm">
          {[{ label: "Veröffentlicht", value: published }, ...rich.facts].map((f) => (
            <div key={f.label} className="grid grid-cols-1 gap-0.5 border-b border-slate-100 px-4 py-2.5 last:border-b-0 sm:grid-cols-[13rem_1fr] sm:gap-4">
              <dt className="text-slate-500">{f.label}</dt>
              <dd className="min-w-0 text-slate-900">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="mt-6 rounded-2xl bg-slate-50 px-5 py-4" aria-label="Kurz gesagt">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">Kurz gesagt</h2>
        <ul className="rich-summary mt-2 list-disc space-y-1.5 pl-5">
          {bullets(rich.summary).map((b) => <li key={b.slice(0, 40)}>{b}</li>)}
        </ul>
      </section>

      <h2 className={H2}>Für wen relevant</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-4 py-2.5 font-medium">Wer</th>
              <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium">Relevanz</th>
              <th className="px-4 py-2.5 font-medium">Warum</th>
            </tr>
          </thead>
          <tbody>
            {rich.audience.map((a) => (
              <tr key={a.name} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2.5 text-slate-900">{a.name}</td>
                <td className="whitespace-nowrap px-4 py-2.5">{a.status}</td>
                <td className="px-4 py-2.5">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={H2}>Worum es geht</h2>
      <div className="mt-3 space-y-3">
        {rich.overview.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
      </div>

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

      <h2 className={H2}>Was jetzt zu tun ist</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        {rich.todos.map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
      </ol>

      {ia && (
        <>
          <h2 className={H2}>Impact-Analyse</h2>
          <div className="mt-3 space-y-6">
            <ImpactList title="Kontrollen" items={ia.controls} />
            <ImpactList title="Prozesse" items={ia.processes} />
            <ImpactList title="Policies" items={ia.policies} />
            {ia.departments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Betroffene Abteilungen</h3>
                <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="px-4 py-2.5 font-medium">Abteilung</th>
                        <th className="w-px whitespace-nowrap px-4 py-2.5 font-medium">Aufwand</th>
                        <th className="px-4 py-2.5 font-medium">Was dort zu tun ist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ia.departments.map((d) => (
                        <tr key={d.name} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-2.5 text-slate-900">{d.name}</td>
                          <td className="whitespace-nowrap px-4 py-2.5">{d.workload}</td>
                          <td className="px-4 py-2.5">{d.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {rich.timeline.length >= 2 && (
        <>
          <h2 className={H2}>Zeitplan</h2>
          <figure className="mt-4">
            <Timeline items={rich.timeline} seed={seed} />
            <figcaption className="mt-2 text-sm text-slate-500">Daten aus der Meldung und dem Originaldokument.</figcaption>
          </figure>
        </>
      )}

      <h2 className={H2}>Häufige Fragen</h2>
      <div className="mt-2">
        {rich.faq.map((q) => (
          <div key={q.q} className="mt-4">
            <h3 className="font-semibold text-slate-900">{q.q}</h3>
            <p className="mt-1">{q.a}</p>
          </div>
        ))}
      </div>

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
