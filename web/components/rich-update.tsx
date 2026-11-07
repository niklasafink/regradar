import { Patrick_Hand } from "next/font/google";
import { Sketch } from "@/components/sketch";
import type { RichAudience, RichUpdate } from "@/lib/rich";

// Handschrift nur für die Strichgrafiken (wie in den Erklärvideos).
const hand = Patrick_Hand({ subsets: ["latin"], weight: "400", variable: "--font-hand" });

const STATUS_LABEL: Record<RichAudience["status"], string> = {
  betroffen: "betroffen",
  teilweise: "teilweise",
  "nicht betroffen": "nicht betroffen",
};

function wrap(s: string, n: number): string[] {
  const lines: string[] = [];
  let cur = "";
  // Umbruch an Leerzeichen und nach „/“ (z. B. „Depotbanken/Verwahrstellen“).
  for (const w of s.split(/\s+/).flatMap((x) => x.split(/(?<=\/)/))) {
    const sep = cur.endsWith("/") ? "" : " ";
    if (cur && cur.length + w.length + sep.length > n) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur}${sep}${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

const SK = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
const handText = { fontFamily: "var(--font-hand), 'Comic Sans MS', cursive" } as const;

/** Zielgruppen in einer Zeile: je Gruppe ein Strichmännchen, Name und Status. */
function AudienceRow({ items, seed }: { items: RichAudience[]; seed: number }) {
  const W = 800;
  const n = items.length;
  const cw = W / n;
  const avail = cw - 14;
  return (
    <Sketch seed={seed}>
      <svg viewBox={`0 0 ${W} 150`} role="img" aria-label="Für wen die Meldung relevant ist"
        className="block h-auto w-full min-w-[560px] text-slate-900" style={handText}>
        {items.map((a, i) => {
          const cx = cw * i + cw / 2;
          const lines = wrap(a.name, Math.max(8, Math.floor(avail / (16 * 0.47)))).slice(0, 2);
          const longest = Math.max(...lines.map((l) => l.length), 1);
          const fs = Math.max(12, Math.min(19, avail / (longest * 0.47)));
          const color = a.status === "betroffen" ? "text-blue-600" : a.status === "nicht betroffen" ? "text-slate-400" : "text-slate-900";
          const statusY = 104 + lines.length * (fs + 3) + 4;
          return (
            <g key={a.name + i}>
              <g className={`fig ${color}`} data-x={cx.toFixed(0)} data-y="78" />
              {a.status === "nicht betroffen" && (
                <>
                  <path className="sk text-red-600" data-w="2.5" d={`M ${cx - 20} 22 L ${cx + 20} 80`} {...SK} />
                  <path className="sk text-red-600" data-w="2.5" d={`M ${cx + 20} 22 L ${cx - 20} 80`} {...SK} />
                </>
              )}
              {lines.map((l, j) => (
                <text key={j} x={cx} y={104 + j * (fs + 3)} textAnchor="middle" className="fill-slate-900" style={{ fontSize: fs }}>
                  {l}
                </text>
              ))}
              <text x={cx} y={statusY} textAnchor="middle" style={{ fontSize: 15 }}
                className={a.status === "betroffen" ? "fill-blue-600" : a.status === "nicht betroffen" ? "fill-red-600" : "fill-slate-500"}>
                {STATUS_LABEL[a.status]}
              </text>
            </g>
          );
        })}
      </svg>
    </Sketch>
  );
}

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

const H2 = "mt-10 font-heading text-xl font-medium tracking-tight text-slate-900";

/** Angereicherte Abschnitte einer Detailseite (Server-Komponente, volles HTML für Suchmaschinen). */
export function RichUpdateSections({ rich, published, seed }: { rich: RichUpdate; published: string; seed: number }) {
  return (
    <div className={`${hand.variable} mt-5 text-base leading-relaxed text-slate-700`}>
      <p className="text-lg leading-relaxed text-slate-600">{rich.lead}</p>
      {rich.aka.length > 0 && (
        <p className="mt-3 text-sm text-slate-500">Auch gesucht als: {rich.aka.join(", ")}</p>
      )}

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

      <section className="mt-6 rounded-2xl bg-slate-50 px-5 py-4" aria-label="Kurzfassung">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">Kurz gesagt</h2>
        <p className="rich-summary mt-1">{rich.summary}</p>
      </section>

      <h2 className={H2}>Worum es geht</h2>
      <div className="mt-3 space-y-3">
        {rich.overview.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
      </div>

      <h2 className={H2}>Für wen relevant</h2>
      <figure className="mt-4">
        <AudienceRow items={rich.audience} seed={seed} />
      </figure>
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

      {rich.timeline.length >= 2 && (
        <>
          <h2 className={H2}>Zeitplan</h2>
          <figure className="mt-4">
            <Timeline items={rich.timeline} seed={seed + 1} />
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
