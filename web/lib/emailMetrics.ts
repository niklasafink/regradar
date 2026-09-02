// E-Mail-Metriken aus Resend (Zustellung, Öffnungen, Klicks, Bounces …).
// Resend liefert die Zahlen kontoweit über GET /emails/metrics; wir holen
// Gesamtwerte plus eine Zeitreihe (täglich/wöchentlich/monatlich).
//
// Braucht einen Resend-Key mit Leserechten: RESEND_METRICS_API_KEY (Fallback
// RESEND_API_KEY). Ein "Sending access"-Key liefert 401 restricted_api_key.
// Öffnungs-/Klickzahlen setzen aktiviertes Open-/Click-Tracking auf der
// Sending-Domain voraus (Resend → Domains → Tracking).

import { Resend, type EmailMetric, type EmailMetricsDataRow, type EmailMetricsTotals } from "resend";

export type Granularity = "daily" | "weekly" | "monthly";

const METRICS: EmailMetric[] = [
  "sent",
  "delivered",
  "delivery_delayed",
  "failed",
  "suppressed",
  "bounced",
  "bounced_permanent",
  "bounced_transient",
  "unique_opened",
  "opened",
  "unique_clicked",
  "clicked",
  "complained",
  "unsubscribed",
  "delivery_rate",
  "open_rate",
  "click_rate",
  "bounce_rate",
  "complaint_rate",
  "unsubscribe_rate",
];

export interface MetricsReport {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  totals: EmailMetricsTotals;
  series: EmailMetricsDataRow[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchEmailMetrics(opts: {
  days?: number;
  granularity?: Granularity;
}): Promise<MetricsReport> {
  const apiKey = process.env.RESEND_METRICS_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_METRICS_API_KEY / RESEND_API_KEY fehlt");

  const days = Math.min(Math.max(opts.days ?? 30, 1), 365);
  const granularity = opts.granularity ?? (days > 90 ? "monthly" : days > 21 ? "weekly" : "daily");
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);

  const resend = new Resend(apiKey);
  const base = {
    startDate: isoDate(start),
    endDate: isoDate(end),
    metrics: METRICS,
    timezone: "Europe/Berlin",
  };

  const [totals, series] = await Promise.all([
    resend.emails.metrics(base),
    resend.emails.metrics({ ...base, granularity, dimensions: ["period"] }),
  ]);

  const err = totals.error ?? series.error;
  if (err) {
    const hint =
      err.name === "restricted_api_key"
        ? " — der Key hat nur Senderechte; RESEND_METRICS_API_KEY mit Full/Read-Access setzen"
        : "";
    throw new Error(`Resend metrics: ${err.message}${hint}`);
  }

  return {
    startDate: base.startDate,
    endDate: base.endDate,
    granularity,
    totals: totals.data?.totals ?? {},
    series: series.data?.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Kleine HTML-Ansicht für den Browser

const KPI: { key: EmailMetric; label: string; rate?: EmailMetric }[] = [
  { key: "sent", label: "Gesendet" },
  { key: "delivered", label: "Zugestellt", rate: "delivery_rate" },
  { key: "unique_opened", label: "Geöffnet (eindeutig)", rate: "open_rate" },
  { key: "unique_clicked", label: "Geklickt (eindeutig)", rate: "click_rate" },
  { key: "bounced", label: "Bounces", rate: "bounce_rate" },
  { key: "complained", label: "Spam-Beschwerden", rate: "complaint_rate" },
  { key: "unsubscribed", label: "Abmeldungen", rate: "unsubscribe_rate" },
  { key: "failed", label: "Fehlgeschlagen" },
];

const COLUMNS: { key: EmailMetric; label: string; pct?: boolean }[] = [
  { key: "sent", label: "Gesendet" },
  { key: "delivered", label: "Zugestellt" },
  { key: "unique_opened", label: "Geöffnet" },
  { key: "open_rate", label: "Öffnungsrate", pct: true },
  { key: "unique_clicked", label: "Geklickt" },
  { key: "click_rate", label: "Klickrate", pct: true },
  { key: "bounced", label: "Bounces" },
  { key: "complained", label: "Spam" },
  { key: "unsubscribed", label: "Abgemeldet" },
];

const nf = new Intl.NumberFormat("de-DE");
const num = (v: number | undefined) => (v == null ? "–" : nf.format(v));
const pct = (v: number | undefined) => (v == null ? "–" : `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

function periodLabel(p: string | undefined, g: Granularity): string {
  if (!p) return "–";
  const d = new Date(p);
  if (Number.isNaN(d.getTime())) return p;
  if (g === "monthly") return d.toLocaleDateString("de-DE", { month: "short", year: "numeric" });
  const s = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return g === "weekly" ? `ab ${s}` : s;
}

export function renderMetricsHtml(r: MetricsReport, days: number): string {
  const kpis = KPI.map(({ key, label, rate }) => {
    const rv = rate ? r.totals[rate] : undefined;
    return `<div class="kpi"><div class="v">${num(r.totals[key])}</div><div class="l">${label}</div>${
      rv != null ? `<div class="r">${pct(rv)}</div>` : ""
    }</div>`;
  }).join("");

  const head = COLUMNS.map((c) => `<th>${c.label}</th>`).join("");
  const rows = [...r.series]
    .reverse()
    .map(
      (row) =>
        `<tr><td>${periodLabel(row.period, r.granularity)}</td>${COLUMNS.map(
          (c) => `<td>${c.pct ? pct(row[c.key]) : num(row[c.key])}</td>`,
        ).join("")}</tr>`,
    )
    .join("");

  const link = (d: number, g?: Granularity) => {
    const q = new URLSearchParams({ html: "1", days: String(d) });
    if (g) q.set("granularity", g);
    return `?${q}`;
  };
  const nav = [7, 30, 90, 365]
    .map((d) => `<a href="${link(d)}" class="${d === days ? "on" : ""}">${d} Tage</a>`)
    .join("");
  const gran = (["daily", "weekly", "monthly"] as Granularity[])
    .map(
      (g) =>
        `<a href="${link(days, g)}" class="${g === r.granularity ? "on" : ""}">${
          { daily: "täglich", weekly: "wöchentlich", monthly: "monatlich" }[g]
        }</a>`,
    )
    .join("");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E-Mail-Metriken · RegRadar</title>
<style>
  body{margin:0;padding:32px 24px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#111;background:#fff}
  h1{font-size:28px;letter-spacing:-.02em;margin:0 0 4px}
  .sub{color:#666;margin:0 0 20px}
  .nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  .nav a{border:1px solid #ddd;border-radius:999px;padding:4px 14px;text-decoration:none;color:#111}
  .nav a.on{background:#111;color:#fff;border-color:#111}
  .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin:24px 0 32px}
  .kpi{border:1px solid #e5e5e5;border-radius:12px;padding:14px 16px}
  .kpi .v{font-size:28px;font-weight:600;letter-spacing:-.02em}
  .kpi .l{color:#666;font-size:13px}
  .kpi .r{font-size:13px;margin-top:4px}
  .wrap{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
  th,td{text-align:right;padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap}
  th:first-child,td:first-child{text-align:left}
  th{font-weight:600;color:#666;font-size:13px}
  .note{color:#666;font-size:13px;margin-top:24px}
</style></head><body>
<h1>E-Mail-Metriken</h1>
<p class="sub">${r.startDate} bis ${r.endDate} · Quelle: Resend (bis zu 15 Minuten Cache)</p>
<div class="nav">${nav}</div>
<div class="nav">${gran}</div>
<div class="kpis">${kpis}</div>
<div class="wrap"><table><thead><tr><th>Zeitraum</th>${head}</tr></thead><tbody>${
    rows || `<tr><td colspan="${COLUMNS.length + 1}">Keine Daten im Zeitraum.</td></tr>`
  }</tbody></table></div>
<p class="note">Öffnungs- und Klickraten beziehen sich auf zugestellte Mails und brauchen aktiviertes Open-/Click-Tracking auf der Sending-Domain. Bounce-Rate bezieht sich auf gesendete Mails. Die Zahlen umfassen alle Mails des Kontos (Update-, Rahmenwerk- und Praxis-Newsletter, Bestätigungs- und Freigabemails).</p>
</body></html>`;
}
