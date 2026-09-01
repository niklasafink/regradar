// Automatischer Newsletter: jeder Abonnent erhält genau die Updates, die das
// System NACH seiner Anmeldung bzw. seiner letzten Zustellung zum ersten Mal
// gesehen hat — keine Archiv-Mails an Neuanmeldungen, keine Duplikate.
//
// Zustand in Redis:
//   newsletter:seen    HASH Slug → ISO-Zeitpunkt, zu dem das Update erstmals
//                      gesehen wurde (First-Seen)
//   newsletter:sent    Alt-Format (SET versandter Slugs), wird einmalig mit
//                      Epoch-Zeitstempel in den Hash migriert
//   newsletter:lastRun ISO-Zeitstempel des letzten Laufs (informativ)
//   subs               pro Abonnent zusätzlich lastNotifiedAt (Wasserzeichen)
//
// Versandregel pro Abonnent: firstSeen(slug) > max(confirmedAt, lastNotifiedAt)
// UND Publikationsdatum >= Anmeldetag. Der zweite Teil verhindert, dass beim
// Aufnehmen eines neuen Rahmenwerks dessen Alt-Archiv (frisches First-Seen,
// aber Jahre altes Publikationsdatum) als "neu" verschickt wird.
// Erster Lauf (kein Hash, kein Alt-Set): Archiv wird mit Epoch markiert und
// nichts verschickt (sonst käme das komplette Archiv).

import { Resend } from "resend";
import { PROVIDERS } from "./data";
import { createSendPacer, createUnsubToken, sendApprovalRequest } from "./email";
import { authority, daysUntil, dt } from "./logic";
import { listSubscribers, redis, setLastNotified, type Subscriber } from "./subscribers";
import { firstParagraph, UPDATE_PAGES, type UpdatePage } from "./updates";

const SEEN_KEY = "newsletter:seen";
const LEGACY_SENT_KEY = "newsletter:sent";
const LAST_RUN_KEY = "newsletter:lastRun";
const MAX_PER_MAIL = 20;
const EPOCH = "1970-01-01T00:00:00.000Z";

export interface RunReport {
  initialized: boolean;
  newUpdates: number;
  recipients: number;
  sent: number;
  skipped: number;
  dryRun: boolean;
  errors: string[];
  /** true: statt Versand wurde eine Freigabe-Anfrage an den Betreiber
      geschickt; pendingItems = Zahl der wartenden Updates. */
  pendingApproval?: boolean;
  pendingItems?: number;
}

/** First-Seen-Zeitpunkte aller Slugs laden bzw. neue Slugs registrieren.
    `first` = allererster Lauf (weder Hash noch Alt-Set vorhanden): dann wird
    das komplette Archiv mit Epoch markiert, damit es niemand erhält. */
async function loadSeen(persist: boolean, nowIso: string): Promise<{
  seen: Record<string, string>;
  newSlugs: string[];
  first: boolean;
}> {
  const seen = (await redis().hgetall<Record<string, string>>(SEEN_KEY)) ?? {};

  // Einmalige Migration vom Alt-Format: bereits versandte Slugs mit Epoch
  // importieren — die hat jeder Bestandsabonnent schon bekommen.
  const toPersist: Record<string, string> = {};
  if (Object.keys(seen).length === 0) {
    const legacy = await redis().smembers(LEGACY_SENT_KEY);
    for (const slug of legacy) {
      seen[slug] = EPOCH;
      toPersist[slug] = EPOCH;
    }
  }

  const first = Object.keys(seen).length === 0;
  const newSlugs: string[] = [];
  for (const p of UPDATE_PAGES) {
    if (seen[p.slug]) continue;
    const ts = first ? EPOCH : nowIso;
    seen[p.slug] = ts;
    toPersist[p.slug] = ts;
    if (!first) newSlugs.push(p.slug);
  }

  if (persist && Object.keys(toPersist).length > 0) {
    await redis().hset(SEEN_KEY, toPersist);
  }
  return { seen, newSlugs, first };
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

/** Lokaler Tagesbeginn eines ISO-Zeitstempels — vergleichbar mit dt(u.d),
    das TT.MM.JJJJ ebenfalls als lokale Mitternacht parst. */
const dayStart = (iso: string): number => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Updates, die für diesen Abonnenten wirklich neu sind:
    1. erstmals gesehen NACH max(confirmedAt, lastNotifiedAt) — nie doppelt,
    2. Publikationsdatum am oder nach dem Anmeldetag — kein Alt-Archiv,
       das nur wegen einer Quellen-/Rahmenwerk-Erweiterung frisch aussieht. */
function freshFor(
  sub: Subscriber,
  sorted: UpdatePage[],
  seen: Record<string, string>,
  nowIso: string,
): UpdatePage[] {
  const watermark = [sub.confirmedAt || EPOCH, sub.lastNotifiedAt || EPOCH]
    .sort()
    .pop()!;
  const minPub = dayStart(sub.confirmedAt || EPOCH);
  return sorted.filter(
    (p) => (seen[p.slug] ?? nowIso) > watermark && dt(p.u.d).getTime() >= minPub,
  );
}

// Wöchentliche Abonnenten erhalten frühestens ~6,5 Tage nach der letzten
// Zustellung (bzw. Anmeldung) wieder Post — der halbe Tag Puffer fängt
// Cron-Jitter ab, damit aus 7 Tagen nicht faktisch 8 werden. Bis dahin
// bleibt ihr Wasserzeichen stehen und die Updates sammeln sich an.
const WEEKLY_MIN_MS = 1000 * 60 * 60 * (24 * 6 + 12);

function dueFor(sub: Subscriber, nowIso: string): boolean {
  if (sub.frequency !== "weekly") return true;
  const watermark = [sub.confirmedAt || EPOCH, sub.lastNotifiedAt || EPOCH]
    .sort()
    .pop()!;
  return Date.parse(nowIso) - Date.parse(watermark) >= WEEKLY_MIN_MS;
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
        <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#475569">${esc(firstParagraph(u.s.de))}</p>
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
        firstParagraph(u.s.de),
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
    `Datenschutz: ${base}/datenschutz`,
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
    <p style="margin:28px 0 16px">
      <a href="${base}/updates"
         style="display:inline-block;white-space:nowrap;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;margin:0 8px 12px 0">
        Alle Updates ansehen →
      </a>
      <a href="${base}/fristen"
         style="display:inline-block;white-space:nowrap;color:#0f172a;border:1px solid #e2e8f0;padding:11px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;margin:0 0 12px 0">
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
  /** true = Versand wurde per Freigabe-Link autorisiert. Ohne dieses Flag
      verschickt ein regulärer Lauf (Cron) nur eine Freigabe-Anfrage an den
      Betreiber — nichts an den Verteiler. */
  approved?: boolean;
} = {}): Promise<RunReport> {
  const report: RunReport = {
    initialized: false, newUpdates: 0, recipients: 0,
    sent: 0, skipped: 0, dryRun: !!opts.dryRun, errors: [],
  };

  // Testversand (?to=) und Dry-Run verändern keinen Zustand.
  const writable = !opts.dryRun && !opts.onlyTo;
  const nowIso = new Date().toISOString();

  const { seen, newSlugs, first } = await loadSeen(writable, nowIso);

  if (first) {
    // Erstlauf: Archiv mit Epoch markiert, nichts verschicken.
    if (writable) await redis().set(LAST_RUN_KEY, nowIso);
    report.initialized = true;
    report.newUpdates = UPDATE_PAGES.length;
    return report;
  }

  report.newUpdates = newSlugs.length;

  const sorted = [...UPDATE_PAGES].sort((a, b) => dt(b.u.d).getTime() - dt(a.u.d).getTime());
  let subs = await listSubscribers();
  if (opts.onlyTo) {
    const only = opts.onlyTo.toLowerCase();
    subs = subs.filter((s) => s.email === only);
    // Unbekannte Testadresse: Wasserzeichen Epoch → alles außer Archiv.
    if (subs.length === 0) subs = [{ email: only, providers: [], confirmedAt: EPOCH }];
  }
  report.recipients = subs.length;

  const base = process.env.APP_URL ?? "http://localhost:3000";

  // Freigabe-Gate: Ein regulärer Lauf (Cron, ohne approved/dry/to) verschickt
  // nichts an Abonnenten, sondern eine Vorschau mit Freigabe-Link an den
  // Betreiber. Erst der Klick ruft diesen Lauf mit approved=true erneut auf.
  // Wasserzeichen bleiben unberührt; der nächste Cron erinnert ggf. erneut.
  if (!opts.approved && writable) {
    const pending = new Map<string, UpdatePage>();
    for (const sub of subs) {
      if (!dueFor(sub, nowIso)) continue; // Wochen-Abo, noch nicht fällig
      const fresh = freshFor(sub, sorted, seen, nowIso);
      for (const p of relevantFor(sub, fresh)) pending.set(p.slug, p);
    }
    if (pending.size === 0) {
      report.skipped = subs.length;
      await redis().set(LAST_RUN_KEY, nowIso);
      return report;
    }
    const pages = sorted.filter((p) => pending.has(p.slug));
    const { html } = renderNewsletter(pages, `${base}/api/unsubscribe?token=preview`, base);
    await sendApprovalRequest(
      "updates",
      `${pages.length} ${pages.length === 1 ? "neues Update" : "neue Updates"} für ${subs.length} Empfänger`,
      html,
    );
    report.pendingApproval = true;
    report.pendingItems = pages.length;
    await redis().set(LAST_RUN_KEY, nowIso);
    return report;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`;
  const pace = createSendPacer(); // Resend: max. 2 Requests/Sekunde

  for (const sub of subs) {
    if (!dueFor(sub, nowIso)) {
      // Wochen-Abo, noch nicht fällig: Wasserzeichen NICHT vorrücken,
      // die Updates kommen gesammelt mit der nächsten fälligen Mail.
      report.skipped++;
      continue;
    }
    const fresh = freshFor(sub, sorted, seen, nowIso);
    if (fresh.length === 0) {
      report.skipped++;
      continue;
    }
    const rel = relevantFor(sub, fresh);
    if (rel.length === 0) {
      // Nichts Relevantes dabei: Wasserzeichen trotzdem vorrücken, damit
      // diese Updates z. B. nach einer späteren Quellen-Erweiterung nicht
      // nachträglich als "neu" verschickt werden.
      if (writable) await setLastNotified(sub.email, nowIso);
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
    await pace();
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
      // Wasserzeichen NICHT vorrücken — der nächste Lauf versucht es erneut.
      report.errors.push(`${sub.email}: ${error.message}`);
    } else {
      report.sent++;
      if (writable) await setLastNotified(sub.email, nowIso);
    }
  }

  if (writable) await redis().set(LAST_RUN_KEY, nowIso);
  return report;
}
