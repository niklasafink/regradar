// Einmalige Ankündigungsmail an alle Abonnenten (Feature-Vorstellung).
// Aktuell: Einschlägigkeits-Prüfung, Versand Mittwoch 11.11.2026, 08:00 Uhr.
//
// Ablauf (Route /api/newsletter/announce):
//   ?to=<adresse>  → Probemail sofort an diese Adresse
//   ?approve=1     → Freigabe setzen (Redis), ?approve=0 nimmt sie zurück
//   ohne Parameter → Vercel-Cron am Versandtag: nur mit Freigabe und nur am
//                    Versandtag; Zustellung per Resend scheduledAt zur vollen Stunde
//   ?dry=1         → nur zählen, nichts senden
// Jede Adresse bekommt die Mail höchstens einmal (Redis-Set SENT).

import { Resend } from "resend";
import {
  createIdToken, createSendPacer, createUnsubToken, isQuotaExceededError, senderFields,
} from "./email";
import { addIdentifyParam } from "./datafast";
import { listSubscribers, redis } from "./subscribers";

const ID = "2026-11-einschlaegigkeit";
/** Versandtag (deutsche Zeit) und Zustellzeitpunkt (08:00 MEZ = 07:00 UTC). */
const SEND_DAY_BERLIN = "2026-11-11";
const SEND_AT = "2026-11-11T07:00:00Z";
const APPROVED = `announce:${ID}:approved`;
const SENT = `announce:${ID}:sent`;

const SUBJECT = "Neu: Welche Updates betreffen Ihr Institut?";

export function renderAnnounce(base: string, unsubUrl: string): { html: string; text: string } {
  const img = `${base}/mail/${ID}`;
  const h2 = "margin:32px 0 4px;font-size:18px;font-weight:500;letter-spacing:-0.01em";
  const sub = "margin:0 0 12px;font-size:14px;line-height:1.5;color:#475569";
  const pic = "display:block;width:100%;max-width:560px;height:auto;border:1px solid #e2e8f0;border-radius:16px";
  const html = `
  <div style="display:none;max-height:0;overflow:hidden;color:#ffffff">Bei jeder Meldung sehen, ob sie für Ihr Haus einschlägig ist.</div>
  <div style="background:#ffffff;padding:32px 16px">
  <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <p style="margin:0 0 28px;font-size:18px"><strong>regulatory</strong><em style="font-weight:300">radar</em></p>
    <p style="margin:0 0 10px">
      <span style="display:inline-block;background:#2563eb;color:#ffffff;border-radius:9999px;padding:2px 10px;font-size:11px;font-weight:600">Neu</span>
    </p>
    <h1 style="margin:0;font-size:26px;font-weight:500;letter-spacing:-0.02em;line-height:1.15">
      Welche Updates betreffen Ihr Institut?
    </h1>

    <h2 style="${h2}">1. Institut anlegen</h2>
    <p style="${sub}">Namen eingeben, den Rest ergänzen wir.</p>
    <a href="${base}/profil" style="text-decoration:none">
      <img src="${img}/bild1-profil.png" width="560" alt="Institutssuche mit Treffer Lindenauer Privatbank AG" style="${pic}">
    </a>

    <h2 style="${h2}">2. Status bei jeder Meldung</h2>
    <p style="${sub}">Einschlägig, teilweise, nicht einschlägig oder unklar, mit Filter.</p>
    <a href="${base}/updates" style="text-decoration:none">
      <img src="${img}/bild2-updates.png" width="560" alt="Alle Updates mit Status und Filter nach Einschlägigkeit" style="${pic}">
    </a>

    <p style="margin:32px 0 0">
      <a href="${base}/profil"
         style="display:inline-block;white-space:nowrap;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">
        Institutsprofil anlegen →
      </a>
    </p>

    <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.6">
      Kostenlos, Anmeldung ohne Passwort. Keine Rechtsberatung, alle Angaben ohne Gewähr.<br>
      <a href="${unsubUrl}" style="color:#64748b">Abmelden</a> &nbsp;
      <a href="${base}/impressum" style="color:#64748b">Impressum</a> &nbsp;
      <a href="${base}/datenschutz" style="color:#64748b">Datenschutz</a>
    </p>
  </div>
  </div>`;
  const text = [
    "regulatoryradar",
    "",
    "Neu: Welche Updates betreffen Ihr Institut?",
    "",
    "1. Institut anlegen",
    "Namen eingeben, den Rest ergänzen wir.",
    "",
    "2. Status bei jeder Meldung",
    "Einschlägig, teilweise, nicht einschlägig oder unklar, mit Filter.",
    "",
    `Institutsprofil anlegen: ${base}/profil`,
    "",
    "Kostenlos, Anmeldung ohne Passwort. Keine Rechtsberatung, alle Angaben ohne Gewähr.",
    `Abmelden: ${unsubUrl}`,
    `Impressum: ${base}/impressum`,
    `Datenschutz: ${base}/datenschutz`,
  ].join("\n");
  return { html, text };
}

function berlinDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

async function sendOne(resend: Resend, base: string, email: string, scheduledAt?: string) {
  const unsubUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(createUnsubToken(email))}`;
  const { html, text } = renderAnnounce(base, unsubUrl);
  return resend.emails.send({
    ...senderFields(),
    to: email,
    ...(scheduledAt ? { scheduledAt } : {}),
    subject: SUBJECT,
    html: addIdentifyParam(html, base, createIdToken(email)),
    text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

export async function setAnnounceApproved(on: boolean): Promise<void> {
  if (on) await redis().set(APPROVED, new Date().toISOString());
  else await redis().del(APPROVED);
}

export async function announceStatus() {
  const [approved, sent, subs] = await Promise.all([
    redis().get<string>(APPROVED), redis().scard(SENT), listSubscribers(),
  ]);
  return { id: ID, sendDay: SEND_DAY_BERLIN, sendAt: SEND_AT, approved, sent, subscribers: subs.length };
}

export async function sendAnnounceTest(base: string, to: string) {
  const { data, error } = await sendOne(new Resend(process.env.RESEND_API_KEY), base, to);
  if (error) throw new Error(error.message);
  return { test: to, id: data?.id };
}

export async function runAnnounce(base: string, opts: { dryRun?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  if (berlinDay(now) !== SEND_DAY_BERLIN) return { skipped: `nicht Versandtag (${SEND_DAY_BERLIN})` };
  if (!(await redis().get(APPROVED))) return { skipped: "keine Freigabe" };

  const subs = await listSubscribers();
  const scheduledAt = now.getTime() < Date.parse(SEND_AT) ? SEND_AT : undefined;
  const report = { recipients: subs.length, sent: 0, already: 0, errors: [] as string[], scheduledAt };
  if (opts.dryRun) return { ...report, dryRun: true };

  const resend = new Resend(process.env.RESEND_API_KEY);
  const pace = createSendPacer();
  for (const sub of subs) {
    // Atomar reservieren: parallele Läufe schicken nie doppelt.
    if ((await redis().sadd(SENT, sub.email)) === 0) { report.already++; continue; }
    await pace();
    const { error } = await sendOne(resend, base, sub.email, scheduledAt);
    if (error) {
      await redis().srem(SENT, sub.email); // nächster Lauf versucht es erneut
      report.errors.push(`${sub.email}: ${error.message}`);
      if (isQuotaExceededError(error)) break;
    } else {
      report.sent++;
    }
  }
  return report;
}
