// Wöchentlicher Newsletter „Aufsichtspraxis und Fristen“ (seit 07.11.2026,
// vorher monatlich nur Praxis): dienstags 11:00 Freigabe-Mail an den
// Betreiber, 12:00 Versand (lib/schedule.ts). Inhalt:
//   1. Aufsichtspraxis der Vorwoche (Dienstag bis Montag): Bußgelder,
//      Zwangsgelder, Verwarnungen, Maßnahmen, Reden — für alle gleich.
//   2. Fristen der nächsten 30 Tage (Konsultationsfristen und
//      Anwendungsbeginne) aus den Updates, gefiltert wie der Update-Newsletter
//      nach Rahmenwerk-Abo bzw. Institutsart des Abonnenten.
// Wer in beiden Teilen nichts hat, bekommt keine Mail.
//
// Doppelversand-Schutz je Woche: Set newsletter:praxisSent:<Slot-Datum>
// (atomarer Claim je Adresse) und Marker newsletter:lastPraxisWeek.

import { Resend } from "resend";
import { addIdentifyParam } from "./datafast";
import {
  createIdToken,
  createSendPacer,
  createUnsubToken,
  isQuotaExceededError,
  sendApprovalRequest,
  sendQuotaExceededAlert,
  senderFields,
} from "./email";
import { PRAXIS, PRAXIS_CAT_LABELS, type PraxisItem } from "./live";
import { dt } from "./core";
import { authority } from "./logic";
import { relevantFor } from "./newsletter";
import { APPROVAL_HOUR_BERLIN, berlinParts, scheduleAt, scheduleLabel, SEND_HOUR_BERLIN } from "./schedule";
import {
  acquireQuotaAlert,
  acquireSendLock,
  clearQuotaBlock,
  releaseSendLock,
  setQuotaBlock,
  writeProgress,
} from "./sendProgress";
import { listSubscribers, redis, type Subscriber } from "./subscribers";
import { UPDATE_PAGES, type UpdatePage } from "./updates";

const WEEK_KEY = "newsletter:lastPraxisWeek";
const sentSetKey = (week: string) => `newsletter:praxisSent:${week}`;
const SENT_SET_TTL_S = 60 * 60 * 24 * 30;

const SLOT_DAY_UTC = 2; // Dienstag
const SLOT_HOUR_UTC = 5; // vor dem Cron (06 UTC) und der Freigabe um 11:00
const FRIST_DAYS = 30;
const MAX_FRISTEN = 25;

/** Jüngster Dienstag 05:00 UTC, der nicht nach `now` liegt. */
export function lastPraxisSlot(now = new Date()): Date {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SLOT_HOUR_UTC));
  slot.setUTCDate(slot.getUTCDate() - ((now.getUTCDay() - SLOT_DAY_UTC + 7) % 7));
  if (slot.getTime() > now.getTime()) slot.setUTCDate(slot.getUTCDate() - 7);
  return slot;
}

/** Wochenschlüssel "JJJJ-MM-TT" (Datum des Dienstags). */
export function weekKey(now = new Date()): string {
  return lastPraxisSlot(now).toISOString().slice(0, 10);
}

const pubDay = (d: string): number => {
  const [day, m, y] = d.split(".").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fmt = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

/** Zeitraum der Vorwoche: Dienstag vor dem Slot bis Montag davor. */
export function weekRange(week: string): { from: number; to: number; label: string } {
  const tue = Date.parse(`${week}T00:00:00Z`);
  const from = tue - 7 * 86_400_000;
  const to = tue - 86_400_000;
  return { from, to, label: `${fmt(from)} bis ${fmt(to)}` };
}

/** Praxis-Meldungen der Vorwoche. */
export function itemsForWeek(week: string, items: PraxisItem[] = PRAXIS): PraxisItem[] {
  const { from, to } = weekRange(week);
  return items.filter((i) => {
    const t = pubDay(i.d);
    return t >= from && t <= to;
  });
}

/** Tage bis TT.MM.JJJJ, gemessen am echten Berliner Tagesdatum (nicht an der
    Build-Konstante TODAY, die am Stand von live.json hängt). */
export function daysTo(d: string, now = new Date()): number {
  const { y, m, d: day } = berlinParts(now);
  return Math.round((pubDay(d) - Date.UTC(y, m - 1, day)) / 86_400_000);
}

export type FristEntry = { date: string; kind: "deadline" | "eff"; page: UpdatePage };

/** Offene Fristen der nächsten 30 Tage, optional gefiltert für einen Abonnenten. */
export function fristenFor(
  sub: Subscriber | null,
  pages: UpdatePage[] = UPDATE_PAGES,
  now = new Date(),
): FristEntry[] {
  const scoped = sub ? relevantFor(sub, pages) : pages;
  const out: FristEntry[] = [];
  const seen = new Set<string>();
  for (const page of scoped) {
    const { u } = page;
    for (const [kind, date] of [["deadline", u.deadline], ["eff", u.eff]] as const) {
      if (!date) continue;
      const n = daysTo(date, now);
      if (n < 0 || n > FRIST_DAYS) continue;
      // Dieselbe Frist desselben Dokuments (z. B. mehrere Rahmenwerke) nur einmal.
      const key = `${kind}|${date}|${u.url ?? u.ti.de}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date, kind, page });
    }
  }
  return out
    .sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime())
    .slice(0, MAX_FRISTEN);
}

const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export interface PraxisRunReport {
  week: string;
  items: number;
  recipients: number;
  sent: number;
  skipped: number;
  dryRun: boolean;
  errors: string[];
  pendingApproval?: boolean;
  alreadySent?: boolean;
  /** Ein anderer Lauf hält die Versand-Sperre — nichts verschickt. */
  locked?: boolean;
  approvalScheduledAt?: string;
  scheduledAt?: string;
}

const catPlural = (c: PraxisItem["cat"], n: number): string =>
  `${n} ${PRAXIS_CAT_LABELS[c].de}${n === 1 ? "" : c === "massnahme" || c === "rede" ? "n" : c === "verwarnung" ? "en" : "er"}`;

/** E-Mail im Site-Design (schwarz-weiß, große Typo, Pill-Buttons). */
export function renderPraxisNewsletter(
  week: string,
  items: PraxisItem[],
  fristen: FristEntry[],
  unsubUrl: string,
  base: string,
): { html: string; text: string; summary: string } {
  const { label } = weekRange(week);
  const byCat = new Map<PraxisItem["cat"], PraxisItem[]>();
  for (const i of items) byCat.set(i.cat, [...(byCat.get(i.cat) ?? []), i]);
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);

  const summary = [
    ...cats.map(([c, list]) => catPlural(c, list.length)),
    fristen.length > 0 ? `${fristen.length} ${fristen.length === 1 ? "Frist" : "Fristen"} in den nächsten ${FRIST_DAYS} Tagen` : "",
  ].filter(Boolean).join(", ");

  const intro =
    "Einmal pro Woche: die praxisrelevanten Schritte der Aufsicht aus der " +
    "Vorwoche (Bußgelder, Zwangsgelder, Verwarnungen, Maßnahmen, Reden) und " +
    `die Fristen der nächsten ${FRIST_DAYS} Tage zu Ihren Rahmenwerken.`;

  const pill = (t: string): string =>
    `<span style="display:inline-block;border:1px solid #e2e8f0;border-radius:9999px;padding:1px 10px;font-size:11px;color:#334155">${esc(t)}</span>`;
  const sectionTitle = (t: string): string =>
    `<h2 style="margin:32px 0 4px;font-size:20px;font-weight:500;letter-spacing:-0.01em">${esc(t)}</h2>`;
  const sub = (t: string): string =>
    `<p style="margin:0 0 8px;font-size:13px;color:#64748b">${esc(t)}</p>`;

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
          ${pill(PRAXIS_CAT_LABELS[i.cat].de)}
          &nbsp;<span class="num">${esc(i.d)}</span>, ${esc(i.auth)}
        </p>
        <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4">
          <a href="${base}/praxis" style="color:#0f172a;text-decoration:none">${esc(i.ti)}</a>
        </p>
        ${i.sum ? `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:#475569">${esc(i.sum)}</p>` : ""}
      </td></tr>`)
    .join("");

  const fristLabel = (f: FristEntry): string => (f.kind === "deadline" ? "Konsultationsfrist" : "Gilt ab");
  const fristRows = fristen
    .map((f) => {
      const n = daysTo(f.date);
      const when = n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`;
      const { slug, fw, u } = f.page;
      return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #f1f5f9">
        <p style="margin:0 0 4px;font-size:12px;color:#64748b">
          ${pill(fristLabel(f))}
          &nbsp;<span class="num" style="color:${f.kind === "deadline" && n < 14 ? "#dc2626" : "#0f172a"};font-weight:600">${esc(f.date)}</span> (${when}), ${esc(authority(u.src))}
        </p>
        <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4">
          <a href="${base}/u/${slug}" style="color:#0f172a;text-decoration:none">${esc(u.ti.de)}</a>
        </p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">${esc(fw.n.de)}, ${esc(fw.ref)}</p>
      </td></tr>`;
    })
    .join("");

  const text = [
    "regulatoryradar",
    "",
    `Aufsichtspraxis und Fristen: ${summary}`,
    "",
    intro,
    "",
    ...(items.length > 0
      ? [
          `Aufsichtspraxis vom ${label}`,
          "",
          ...cats.map(([c, list]) => `${PRAXIS_CAT_LABELS[c].de}: ${list.length}`),
          "",
          ...items.flatMap((i) => [
            `${i.d}, ${PRAXIS_CAT_LABELS[i.cat].de}, ${i.auth}`,
            i.ti,
            ...(i.sum ? [i.sum] : []),
            `${base}/praxis`,
            "",
          ]),
        ]
      : []),
    ...(fristen.length > 0
      ? [
          `Fristen der nächsten ${FRIST_DAYS} Tage`,
          "",
          ...fristen.flatMap((f) => [
            `${f.date}, ${fristLabel(f)}, ${authority(f.page.u.src)}`,
            f.page.u.ti.de,
            `${f.page.fw.n.de}, ${f.page.fw.ref}`,
            `${base}/u/${f.page.slug}`,
            "",
          ]),
        ]
      : []),
    `Alle Fristen: ${base}/fristen`,
    `Alle Praxis-Meldungen: ${base}/praxis`,
    "",
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
      Aufsichtspraxis und Fristen
    </h1>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#64748b">${esc(intro)}</p>
    ${items.length > 0 ? `
    ${sectionTitle("Aufsichtspraxis der Vorwoche")}
    ${sub(label)}
    ${cats.length > 1 ? `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e2e8f0;margin-bottom:12px">
      ${bars}
    </table>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
      ${itemRows}
    </table>` : ""}
    ${fristen.length > 0 ? `
    ${sectionTitle(`Fristen der nächsten ${FRIST_DAYS} Tage`)}
    ${sub("Konsultationsfristen und Anwendungsbeginne zu Ihren Rahmenwerken.")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
      ${fristRows}
    </table>` : ""}
    <p style="margin:28px 0 16px">
      <a href="${base}/fristen"
         style="display:inline-block;white-space:nowrap;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;margin:0 8px 12px 0">
        Alle Fristen →
      </a>
      <a href="${base}/praxis"
         style="display:inline-block;white-space:nowrap;color:#0f172a;border:1px solid #e2e8f0;padding:11px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;margin:0 0 12px 0">
        Alle Praxis-Meldungen →
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
  const now = new Date();
  const week = weekKey(now);
  const month = week; // Schlüssel für Claim-Set und Marker (Name aus der Monatsfassung)
  const items = itemsForWeek(week);
  const report: PraxisRunReport = {
    week, items: items.length, recipients: 0, sent: 0, skipped: 0,
    dryRun: !!opts.dryRun, errors: [],
  };

  const writable = !opts.dryRun && !opts.onlyTo;

  // Doppelversand-Schutz: pro Woche höchstens ein echter Versand.
  if (writable && (await redis().get<string>(WEEK_KEY)) === week) {
    report.alreadySent = true;
    return report;
  }

  let subs = await listSubscribers();
  if (opts.onlyTo) {
    const only = opts.onlyTo.toLowerCase();
    subs = subs.filter((s) => s.email === only);
    if (subs.length === 0) {
      subs = [{ email: only, providers: [], confirmedAt: now.toISOString() }];
    }
  }
  report.recipients = subs.length;

  const base = process.env.APP_URL ?? "http://localhost:3000";

  // Freigabe-Gate analog zu runNewsletter: Vorschau mit allen Fristen
  // (ungefiltert), Zustellung der Freigabe-Mail dienstags 11:00.
  if (!opts.approved && writable) {
    const allFristen = fristenFor(null);
    if (items.length === 0 && allFristen.length === 0) return report;
    const { html, summary } = renderPraxisNewsletter(
      week, items, allFristen, `${base}/api/unsubscribe?token=preview`, base,
    );
    const approvalAt = scheduleAt(APPROVAL_HOUR_BERLIN, now);
    await sendApprovalRequest(
      "praxis",
      `Aufsichtspraxis und Fristen (${summary || "keine Praxis-Meldungen"}) für ${subs.length} Empfänger, Versand ${scheduleLabel(scheduleAt(SEND_HOUR_BERLIN, now))}`,
      html,
      undefined,
      approvalAt,
    );
    report.pendingApproval = true;
    report.approvalScheduledAt = approvalAt;
    return report;
  }

  // Zustellung 12:00 deutscher Zeit; nach 12:00 oder bei Testversand sofort.
  const sendAt = opts.onlyTo ? undefined : scheduleAt(SEND_HOUR_BERLIN, now);
  report.scheduledAt = sendAt;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { from, replyTo } = senderFields();
  const pace = createSendPacer();

  // Lauf-Sperre gegen parallele Freigabe-Klicks: nur ein echter Versand
  // gleichzeitig, der zweite Klick sieht auf der Statusseite den laufenden.
  if (writable && !(await acquireSendLock("praxis"))) {
    report.locked = true;
    return report;
  }
  const startedAt = new Date().toISOString();
  const progress = async (done: boolean) => {
    if (!writable) return;
    await writeProgress({
      kind: "praxis", total: report.recipients, sent: report.sent,
      skipped: report.skipped, errors: report.errors.length, done, startedAt,
    });
  };

  let quotaHit: string | null = null;

  try {
    await progress(false);
    for (const sub of subs) {
      if (opts.dryRun) {
        report.sent++;
        continue;
      }
      // Atomarer Claim vor dem Send: sadd liefert 0, wenn die Adresse schon
      // im Set steht — dann hat dieser oder ein früherer Lauf sie bereits
      // beliefert. Doppelzustellung ist damit auch bei Races ausgeschlossen;
      // schlägt der Send danach fehl, gibt srem den Claim wieder frei.
      if (writable) {
        const claimed = await redis().sadd(sentSetKey(month), sub.email);
        if (claimed === 0) {
          report.skipped++;
          continue;
        }
        await redis().expire(sentSetKey(month), SENT_SET_TTL_S);
      }
      const fristen = fristenFor(sub);
      if (items.length === 0 && fristen.length === 0) {
        if (writable) await redis().srem(sentSetKey(month), sub.email);
        report.skipped++;
        continue;
      }
      const unsubUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(createUnsubToken(sub.email))}`;
      const { html, text, summary } = renderPraxisNewsletter(week, items, fristen, unsubUrl, base);
      const payload = {
        from,
        replyTo,
        to: sub.email,
        ...(sendAt ? { scheduledAt: sendAt } : {}),
        subject: `Aufsichtspraxis und Fristen: ${summary}`,
        html: addIdentifyParam(html, base, createIdToken(sub.email)),
        text,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
      await pace();
      let { error } = await resend.emails.send(payload);
      // Rate-Limit trotz Drossel (z. B. paralleler Einzel-Send anderswo):
      // einmal kurz warten und wiederholen; bleibt der Fehler, fängt ihn der
      // idempotente Wiederholungslauf über den Freigabe-Link.
      if (error && /rate|429|too many/i.test(error.message)) {
        await new Promise((r) => setTimeout(r, 1500));
        ({ error } = await resend.emails.send(payload));
      }
      if (error) {
        if (writable) await redis().srem(sentSetKey(month), sub.email);
        report.errors.push(`${sub.email}: ${error.message}`);
        if (isQuotaExceededError(error)) {
          quotaHit = error.name;
          break; // weitere Versuche scheitern garantiert ebenso; Rest bleibt unberührt
        }
      } else {
        report.sent++;
      }
      await progress(false);
    }

    // Woche erst als erledigt markieren, wenn wirklich alle beliefert sind —
    // bei Restfehlern bleibt der Marker frei, damit ein erneuter Klick auf den
    // Freigabe-Link nur die fehlenden Adressen nachliefert.
    if (writable && report.errors.length === 0) {
      await redis().set(WEEK_KEY, week);
    }

    if (writable) {
      if (quotaHit) {
        const remaining = report.recipients - (report.sent + report.skipped + report.errors.length);
        await setQuotaBlock({
          kind: "praxis", errorName: quotaHit, blockedAt: new Date().toISOString(),
          sent: report.sent, remaining,
        });
        if (await acquireQuotaAlert("praxis")) {
          try {
            await sendQuotaExceededAlert("praxis", quotaHit, report.sent, remaining);
          } catch (e) {
            console.error("quota alert failed:", e);
          }
        }
      } else {
        await clearQuotaBlock("praxis");
      }
    }
  } finally {
    if (writable) {
      await progress(true);
      await releaseSendLock("praxis");
    }
  }

  return report;
}
