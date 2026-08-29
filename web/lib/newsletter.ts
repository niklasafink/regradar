// Automatischer Newsletter: verschickt alle noch nicht versandten Updates
// an die bestätigten Abonnenten, gefiltert nach deren Anbietertyp.
//
// Zustand in Redis:
//   newsletter:sent    SET bereits versandter Update-Slugs
//   newsletter:lastRun ISO-Zeitstempel des letzten Laufs (informativ)
//
// Erster Lauf: Das Set ist leer — dann werden alle aktuellen Slugs als
// "versandt" markiert und nichts verschickt (sonst käme das komplette Archiv).

import { Resend } from "resend";
import { PROVIDERS } from "./data";
import { createUnsubToken } from "./email";
import { authority, daysUntil, dt } from "./logic";
import { listSubscribers, redis, type Subscriber } from "./subscribers";
import { UPDATE_PAGES, type UpdatePage } from "./updates";

const SENT_KEY = "newsletter:sent";
const LAST_RUN_KEY = "newsletter:lastRun";
const MAX_PER_MAIL = 20;

export interface RunReport {
  initialized: boolean;
  newUpdates: number;
  recipients: number;
  sent: number;
  skipped: number;
  dryRun: boolean;
  errors: string[];
}

/** Noch nicht versandte Updates, neueste zuerst. */
async function unsentPages(): Promise<{ pages: UpdatePage[]; first: boolean }> {
  const sent = await redis().smembers(SENT_KEY);
  if (sent.length === 0) return { pages: UPDATE_PAGES, first: true };
  const sentSet = new Set(sent);
  return { pages: UPDATE_PAGES.filter((p) => !sentSet.has(p.slug)), first: false };
}

/** Updates, die für die abonnierten Anbietertypen relevant sind.
    Ohne (oder mit unbekanntem) Anbietertyp: alle Updates. */
function relevantFor(sub: Subscriber, pages: UpdatePage[]): UpdatePage[] {
  const provs = sub.providers.filter(Boolean);
  if (provs.length === 0) return pages;
  // Unbekannte Anbietertypen (Alt-Daten) zählen nicht als Filter.
  const known = provs.filter((pr) => PROVIDERS.some((p) => p.id === pr));
  if (known.length === 0) return pages;
  return pages.filter((p) => known.some((pr) => p.fw.ents.includes(pr)));
}

const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const fmtDe = (d: string): string => d; // bereits TT.MM.JJJJ

/** E-Mail im Site-Design: schwarz-weiß, große Typo, Pill-Button.
    Liefert HTML plus Plain-Text-Alternative (bessere Spam-Bewertung). */
export function renderNewsletter(
  pages: UpdatePage[],
  unsubUrl: string,
  base: string,
): { html: string; text: string } {
  const shown = pages.slice(0, MAX_PER_MAIL);
  const more = pages.length - shown.length;

  const items = shown
    .map(({ slug, fw, u }) => {
      const deadline =
        u.deadline && daysUntil(u.deadline) >= 0
          ? `<span style="color:${daysUntil(u.deadline) < 60 ? "#dc2626" : "#64748b"}">Frist ${fmtDe(u.deadline)}</span>`
          : "";
      const eff = u.eff ? `<span style="color:#64748b">Gilt ab ${fmtDe(u.eff)}</span>` : "";
      const meta = [deadline, eff].filter(Boolean).join(" &nbsp; ");
      return `
      <tr><td style="padding:20px 0;border-bottom:1px solid #f1f5f9">
        <p style="margin:0 0 6px;font-size:12px;color:#64748b">
          <span class="num">${fmtDe(u.d)}</span> &nbsp;
          <span style="display:inline-block;border:1px solid #e2e8f0;border-radius:9999px;padding:1px 10px;font-size:11px;color:#334155">${esc(u.t.de)}</span> &nbsp;
          ${esc(authority(u.src))}
        </p>
        <p style="margin:0 0 6px;font-size:15px;font-weight:600;line-height:1.35">
          <a href="${base}/u/${slug}" style="color:#0f172a;text-decoration:none">${esc(u.ti.de)}</a>
        </p>
        <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#475569">${esc(u.s.de)}</p>
        <p style="margin:0;font-size:12px">${meta}
          ${meta ? " &nbsp; " : ""}<span style="color:#94a3b8">${esc(fw.n.de)}, ${esc(fw.ref)}</span>
        </p>
      </td></tr>`;
    })
    .join("");

  const text = [
    "regulatoryradar",
    "",
    pages.length === 1
      ? "1 neues regulatorisches Update"
      : `${pages.length} neue regulatorische Updates`,
    "Neu veröffentlichte Meldungen aus den Primärquellen, kompakt zusammengefasst.",
    "",
    ...shown.flatMap(({ slug, fw, u }) => {
      const meta = [
        u.deadline && daysUntil(u.deadline) >= 0 ? `Frist ${fmtDe(u.deadline)}` : "",
        u.eff ? `Gilt ab ${fmtDe(u.eff)}` : "",
        `${fw.n.de}, ${fw.ref}`,
      ].filter(Boolean).join(" · ");
      return [
        `${fmtDe(u.d)} · ${u.t.de} · ${authority(u.src)}`,
        u.ti.de,
        u.s.de,
        meta,
        `${base}/u/${slug}`,
        "",
      ];
    }),
    ...(more > 0 ? [`… und ${more} weitere Updates auf der Website.`, ""] : []),
    `Alle Updates: ${base}/updates`,
    `Offene Fristen: ${base}/fristen`,
    "",
    "Sie erhalten diese E-Mail, weil Sie Updates von Regulatory Radar abonniert haben.",
    "Keine Rechtsberatung, alle Angaben ohne Gewähr.",
    `Abmelden: ${unsubUrl}`,
    `Impressum: ${base}/impressum`,
  ].join("\n");

  const html = `
  <div style="background:#ffffff;padding:32px 16px">
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <p style="margin:0 0 28px;font-size:18px"><strong>regulatory</strong><em style="font-weight:300">radar</em></p>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:500;letter-spacing:-0.02em;line-height:1.15">
      ${pages.length === 1 ? "1 neues regulatorisches Update" : `${pages.length} neue regulatorische Updates`}
    </h1>
    <p style="margin:0 0 8px;font-size:14px;color:#64748b">
      Neu veröffentlichte Meldungen aus den Primärquellen, kompakt zusammengefasst.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
      ${items}
    </table>
    ${more > 0 ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b">und ${more} weitere Updates auf der Website.</p>` : ""}
    <p style="margin:28px 0">
      <a href="${base}/updates"
         style="background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">
        Alle Updates ansehen →
      </a>
      &nbsp;&nbsp;
      <a href="${base}/fristen"
         style="color:#0f172a;border:1px solid #e2e8f0;padding:11px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">
        Offene Fristen →
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

  return { html, text };
}

export async function runNewsletter(opts: {
  dryRun?: boolean;
  onlyTo?: string;
} = {}): Promise<RunReport> {
  const report: RunReport = {
    initialized: false, newUpdates: 0, recipients: 0,
    sent: 0, skipped: 0, dryRun: !!opts.dryRun, errors: [],
  };

  const { pages, first } = await unsentPages();

  if (first) {
    // Erstlauf: Archiv als versandt markieren, nichts verschicken.
    if (!opts.dryRun && pages.length) {
      const [head, ...rest] = pages.map((p) => p.slug);
      await redis().sadd(SENT_KEY, head, ...rest);
      await redis().set(LAST_RUN_KEY, new Date().toISOString());
    }
    report.initialized = true;
    report.newUpdates = pages.length;
    return report;
  }

  report.newUpdates = pages.length;
  if (pages.length === 0) return report;

  const sorted = [...pages].sort((a, b) => dt(b.u.d).getTime() - dt(a.u.d).getTime());
  let subs = await listSubscribers();
  if (opts.onlyTo) {
    const only = opts.onlyTo.toLowerCase();
    subs = subs.filter((s) => s.email === only);
    if (subs.length === 0) subs = [{ email: only, providers: [], confirmedAt: "" }];
  }
  report.recipients = subs.length;

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`;

  for (const sub of subs) {
    const rel = relevantFor(sub, sorted);
    if (rel.length === 0) {
      report.skipped++;
      continue;
    }
    if (opts.dryRun) {
      report.sent++;
      continue;
    }
    const unsubUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(createUnsubToken(sub.email))}`;
    const subject =
      rel.length === 1
        ? `Neues regulatorisches Update: ${rel[0].u.ti.de.slice(0, 80)}`
        : `${rel.length} neue regulatorische Updates`;
    const { html, text } = renderNewsletter(rel, unsubUrl, base);
    const { error } = await resend.emails.send({
      from,
      to: sub.email,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        // One-Click-Unsubscribe (RFC 8058) — Gmail/Outlook werten das fürs
        // Spam-Scoring aus; die Route beantwortet den POST ohne Redirect.
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) {
      report.errors.push(`${sub.email}: ${error.message}`);
    } else {
      report.sent++;
    }
  }

  // Erst nach dem Versand als erledigt markieren; bei Teilfehlern werden die
  // Updates trotzdem markiert, Fehler stehen im Report.
  if (!opts.dryRun && !opts.onlyTo) {
    const [head, ...rest] = sorted.map((p) => p.slug);
    await redis().sadd(SENT_KEY, head, ...rest);
    await redis().set(LAST_RUN_KEY, new Date().toISOString());
  }
  return report;
}
