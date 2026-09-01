// Monatlicher Praxis-Newsletter: bündelt die Aufsichtspraxis des Vormonats
// in einer E-Mail — aktuell Zählung je Maßnahmen-Art als Balkendiagramm plus
// Liste der Einzelfälle mit Kurzbeschreibung (Hintergrund, Betragshöhe).
// Inhaltlich bewusst offen gehalten: künftig können weitere Praxishinweise
// dazukommen, der Newsletter ist nicht rein bußgeld-getrieben.
// Links führen auf die Praxis-Seite von Regulatory Radar, nicht direkt auf
// die Primärquellen.
//
// Anders als Update-/Rahmenwerk-Newsletter braucht es kein Wasserzeichen pro
// Abonnent: alle bekommen dieselbe Monats-Zusammenfassung. Doppelversand
// verhindert der Redis-Marker newsletter:lastPraxisMonth ("2026-08").
// Freigabe-Flow wie bei allen Versänden: Cron schickt nur eine Vorschau mit
// Freigabe-Link an den Betreiber; erst der Klick löst den Versand aus.

import { Resend } from "resend";
import { createUnsubToken, sendApprovalRequest } from "./email";
import { PRAXIS, PRAXIS_CAT_LABELS, type PraxisItem } from "./live";
import { listSubscribers, redis } from "./subscribers";

const MONTH_KEY = "newsletter:lastPraxisMonth";

const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Vormonat als "YYYY-MM" (UTC — Cron läuft am Monatsersten 07:00 UTC). */
export function previousMonthKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" → "August 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES_DE[Number(m) - 1]} ${y}`;
}

/** Praxis-Meldungen eines Kalendermonats ("d" ist "TT.MM.JJJJ"). */
export function itemsForMonth(key: string, items: PraxisItem[] = PRAXIS): PraxisItem[] {
  const [y, m] = key.split("-");
  return items.filter((i) => i.d.endsWith(`.${m}.${y}`));
}

const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export interface PraxisRunReport {
  month: string;
  items: number;
  recipients: number;
  sent: number;
  skipped: number;
  dryRun: boolean;
  errors: string[];
  pendingApproval?: boolean;
  alreadySent?: boolean;
}

/** E-Mail im Site-Design (schwarz-weiß, große Typo, Pill-Buttons). */
export function renderPraxisNewsletter(
  key: string,
  items: PraxisItem[],
  unsubUrl: string,
  base: string,
): { html: string; text: string; summary: string } {
  const label = monthLabel(key);
  const byCat = new Map<PraxisItem["cat"], PraxisItem[]>();
  for (const i of items) byCat.set(i.cat, [...(byCat.get(i.cat) ?? []), i]);
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);

  const summary = cats
    .map(([c, list]) => `${list.length} ${PRAXIS_CAT_LABELS[c].de}${list.length === 1 ? "" : c === "massnahme" ? "n" : c === "verwarnung" ? "en" : "er"}`)
    .join(", ");

  const intro =
    "Einmal im Monat bündeln wir hier die praxisrelevanten Schritte der " +
    "Aufsicht: Bußgelder, Zwangsgelder, Verwarnungen und Maßnahmen gegen " +
    "Institute.";

  // Balken je Art: Breite proportional zur größten Kategorie (max. 220px).
  const max = Math.max(1, ...cats.map(([, l]) => l.length));
  const bars = cats
    .map(([c, list]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#334155;white-space:nowrap">${esc(PRAXIS_CAT_LABELS[c].de)}</td>
        <td style="padding:6px 0;width:100%">
          <div style="background:#0f172a;height:14px;border-radius:9999px;width:${Math.max(12, Math.round((list.length / max) * 220))}px"></div>
        </td>
        <td class="num" style="padding:6px 0 6px 12px;font-size:13px;font-weight:600;color:#0f172a">${list.length}</td>
      </tr>`)
    .join("");

  const itemRows = items
    .map((i) => `
      <tr><td style="padding:12px 0;border-bottom:1px solid #f1f5f9">
        <p style="margin:0 0 4px;font-size:12px;color:#64748b">
          <span style="display:inline-block;border:1px solid #e2e8f0;border-radius:9999px;padding:1px 10px;font-size:11px;color:#334155">${esc(PRAXIS_CAT_LABELS[i.cat].de)}</span>
          &nbsp;<span class="num">${esc(i.d)}</span>, ${esc(i.auth)}
        </p>
        <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4">
          <a href="${base}/praxis" style="color:#0f172a;text-decoration:none">${esc(i.ti)}</a>
        </p>
        ${i.sum ? `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:#475569">${esc(i.sum)}</p>` : ""}
      </td></tr>`)
    .join("");

  const text = [
    "regulatoryradar",
    "",
    `Aufsichtspraxis im ${label}: ${summary}`,
    "",
    intro,
    "",
    ...cats.map(([c, list]) => `${PRAXIS_CAT_LABELS[c].de}: ${list.length}`),
    "",
    "EINZELFÄLLE",
    "",
    ...items.flatMap((i) => [
      `${i.d}, ${PRAXIS_CAT_LABELS[i.cat].de}, ${i.auth}`,
      i.ti,
      ...(i.sum ? [i.sum] : []),
      `${base}/praxis`,
      "",
    ]),
    "Sie erhalten diese E-Mail, weil Sie Updates von Regulatory Radar abonniert haben.",
    "Keine Rechtsberatung, alle Angaben ohne Gewähr.",
    `Abmelden: ${unsubUrl}`,
    `Impressum: ${base}/impressum`,
    `Datenschutz: ${base}/datenschutz`,
  ].join("\n");

  const html = `
  <div style="background:#ffffff;padding:32px 16px">
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <p style="margin:0 0 28px;font-size:18px"><strong>regulatory</strong><em style="font-weight:300">radar</em></p>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:500;letter-spacing:-0.02em;line-height:1.15">
      Aufsichtspraxis im ${esc(label)}
    </h1>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#64748b">${esc(intro)}</p>
    ${cats.length > 1 ? `
    <p style="margin:24px 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8">Nach Art der Maßnahme</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e2e8f0;margin-bottom:4px">
      ${bars}
    </table>` : ""}
    <p style="margin:24px 0 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8">Einzelfälle</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
      ${itemRows}
    </table>
    <p style="margin:28px 0 16px">
      <a href="${base}/praxis"
         style="display:inline-block;white-space:nowrap;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">
        Alle Praxis-Meldungen ansehen →
      </a>
    </p>
    <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.6">
      Sie erhalten diese E-Mail, weil Sie Updates von Regulatory Radar abonniert haben.
      Keine Rechtsberatung, alle Angaben ohne Gewähr.<br>
      <a href="${unsubUrl}" style="color:#64748b">Abmelden</a> &nbsp;
      <a href="${base}/impressum" style="color:#64748b">Impressum</a> &nbsp;
      <a href="${base}/datenschutz" style="color:#64748b">Datenschutz</a>
    </p>
  </div>
  </div>`;

  return { html, text, summary };
}

export async function runPraxisNewsletter(opts: {
  dryRun?: boolean;
  onlyTo?: string;
  /** true = Versand wurde per Freigabe-Link autorisiert (Freigabe-Flow wie
      bei allen Versänden; der Cron-Lauf verschickt sonst nur die Vorschau). */
  approved?: boolean;
} = {}): Promise<PraxisRunReport> {
  const month = previousMonthKey();
  const items = itemsForMonth(month);
  const report: PraxisRunReport = {
    month, items: items.length, recipients: 0, sent: 0, skipped: 0,
    dryRun: !!opts.dryRun, errors: [],
  };

  const writable = !opts.dryRun && !opts.onlyTo;

  // Doppelversand-Schutz: pro Monat höchstens ein echter Versand.
  if (writable && (await redis().get<string>(MONTH_KEY)) === month) {
    report.alreadySent = true;
    return report;
  }
  if (items.length === 0) return report;

  let subs = await listSubscribers();
  if (opts.onlyTo) {
    const only = opts.onlyTo.toLowerCase();
    subs = subs.filter((s) => s.email === only);
    if (subs.length === 0) {
      subs = [{ email: only, providers: [], confirmedAt: new Date().toISOString() }];
    }
  }
  report.recipients = subs.length;

  const base = process.env.APP_URL ?? "http://localhost:3000";

  // Freigabe-Gate analog zu runFwNewsletter.
  if (!opts.approved && writable) {
    const { html, summary } = renderPraxisNewsletter(
      month, items, `${base}/api/unsubscribe?token=preview`, base,
    );
    await sendApprovalRequest(
      "praxis",
      `Aufsichtspraxis ${monthLabel(month)} (${summary}) für ${subs.length} Empfänger`,
      html,
    );
    report.pendingApproval = true;
    return report;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`;

  for (const sub of subs) {
    if (opts.dryRun) {
      report.sent++;
      continue;
    }
    const unsubUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(createUnsubToken(sub.email))}`;
    const { html, text, summary } = renderPraxisNewsletter(month, items, unsubUrl, base);
    const { error } = await resend.emails.send({
      from,
      to: sub.email,
      subject: `Aufsichtspraxis im ${monthLabel(month)}: ${summary}`,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) report.errors.push(`${sub.email}: ${error.message}`);
    else report.sent++;
  }

  // Monat erst nach (weitgehend) erfolgreichem Versand als erledigt markieren.
  if (writable && report.sent > 0) {
    await redis().set(MONTH_KEY, month);
  }

  return report;
}
