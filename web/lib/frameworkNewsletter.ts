// Wöchentlicher "Neu in der Datenbank"-Newsletter: informiert Abonnenten über
// Rahmenwerke und Quellen, die seit dem letzten Versand NEU in die Datenbank
// aufgenommen wurden. "Neu" heißt neu für die Datenbank — das Rahmenwerk
// selbst kann alt sein (wir erweitern die Abdeckung laufend um bestehende
// Gesetze/Normen).
//
// Zustand in Redis (analog zum Update-Newsletter in newsletter.ts):
//   newsletter:fwseen  HASH "fw:<id>" bzw. "src:<id>" → ISO-Zeitpunkt, zu dem
//                      der Eintrag erstmals gesehen wurde (First-Seen)
//   subs               pro Abonnent zusätzlich lastFwNotifiedAt
//
// Versandregel pro Abonnent: firstSeen > max(confirmedAt, lastFwNotifiedAt).
// Dadurch bekommt ein Neuanmelder nur Zugänge zu sehen, die NACH seiner
// Registrierung dazukamen, und niemand denselben Zugang zweimal — die
// First-Seen-Zeitpunkte selbst sind global (für alle gleich).
// Erster Lauf (Hash leer): kompletter Bestand wird mit Epoch markiert und
// nichts verschickt (sonst käme die gesamte Datenbank als "neu").

import { Resend } from "resend";
import { FRAMEWORKS, PROVIDERS, type Framework } from "./data";
import { addIdentifyParam } from "./datafast";
import { createIdToken, createSendPacer, createUnsubToken, sendApprovalRequest, senderFields } from "./email";
import { acquireSendLock, releaseSendLock, writeProgress } from "./sendProgress";
import { listSubscribers, redis, setLastFwNotified } from "./subscribers";
import { JURISDICTION_LABEL, SOURCES, type Source } from "./sources";

const SEEN_KEY = "newsletter:fwseen";
// Zeitpunkt des letzten echten Versands an Abonnenten. Der lokale Stundenlauf
// (scraper/clear_newsletter_pending.py) fragt ihn ab und leert danach
// NEWSLETTER_PENDING.md im Repo.
const LAST_SENT_KEY = "newsletter:lastFwSentAt";
const EPOCH = "1970-01-01T00:00:00.000Z";

export async function lastFwSentAt(): Promise<string | null> {
  return await redis().get<string>(LAST_SENT_KEY);
}

export interface FwRunReport {
  initialized: boolean;
  newFrameworks: number;
  newSources: number;
  recipients: number;
  sent: number;
  skipped: number;
  dryRun: boolean;
  errors: string[];
  /** true: statt Versand wurde eine Freigabe-Anfrage an den Betreiber
      geschickt; pendingItems = Zahl der wartenden Zugänge. */
  pendingApproval?: boolean;
  pendingItems?: number;
  /** Ein anderer Lauf hält die Versand-Sperre — nichts verschickt. */
  locked?: boolean;
}

/** First-Seen-Zeitpunkte laden bzw. neue Rahmenwerke/Quellen registrieren. */
async function loadSeen(persist: boolean, nowIso: string): Promise<{
  seen: Record<string, string>;
  first: boolean;
}> {
  const seen = (await redis().hgetall<Record<string, string>>(SEEN_KEY)) ?? {};
  const first = Object.keys(seen).length === 0;

  const toPersist: Record<string, string> = {};
  const keys = [
    ...FRAMEWORKS.map((f) => `fw:${f.id}`),
    ...SOURCES.map((s) => `src:${s.id}`),
  ];
  for (const key of keys) {
    if (seen[key]) continue;
    const ts = first ? EPOCH : nowIso;
    seen[key] = ts;
    toPersist[key] = ts;
  }

  if (persist && Object.keys(toPersist).length > 0) {
    await redis().hset(SEEN_KEY, toPersist);
  }
  return { seen, first };
}

const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const JUR_LABEL: Record<Framework["jur"], string> = {
  EU: "EU", DE: "Deutschland", "EU+DE": "EU + Deutschland", LU: "Luxemburg",
};

/** Detailseite eines Rahmenwerks über den ersten zugeordneten Anbietertyp. */
function frameworkHref(fw: Framework, base: string): string {
  const provider = PROVIDERS.find((p) => fw.ents.includes(p.id)) ?? PROVIDERS[0];
  return `${base}/r/${provider.slug}/f/${fw.id}`;
}

/** E-Mail im Site-Design (schwarz-weiß, große Typo, Pill-Buttons), analog
    zum Update-Newsletter. Liefert HTML plus Plain-Text-Alternative. */
export function renderFwNewsletter(
  frameworks: Framework[],
  sources: Source[],
  unsubUrl: string,
  base: string,
): { html: string; text: string } {
  const heading = [
    frameworks.length > 0
      ? `${frameworks.length} ${frameworks.length === 1 ? "Rahmenwerk" : "Rahmenwerke"}`
      : "",
    sources.length > 0
      ? `${sources.length} ${sources.length === 1 ? "Quelle" : "Quellen"}`
      : "",
  ].filter(Boolean).join(" und ");

  const intro =
    `Wir haben die Datenbank von Regulatory Radar um ${heading} erweitert.`;

  const pill = (label: string): string =>
    `<span style="display:inline-block;border:1px solid #e2e8f0;border-radius:9999px;padding:1px 10px;font-size:11px;color:#334155;margin:0 4px 4px 0">${esc(label)}</span>`;

  /** Zielgruppen eines Rahmenwerks (Anbietertypen) als Anzeigenamen. */
  const audiences = (fw: Framework): string[] =>
    PROVIDERS.filter((p) => fw.ents.includes(p.id)).map((p) => p.n.de);

  const fwItems = frameworks
    .map((fw) => `
      <tr><td style="padding:20px 0;border-bottom:1px solid #f1f5f9">
        <p style="margin:0 0 6px;font-size:12px;color:#64748b">
          ${pill(JUR_LABEL[fw.jur])}${audiences(fw).map(pill).join("")} &nbsp;
          <span class="num">${esc(fw.ref)}</span>
        </p>
        <p style="margin:0 0 6px;font-size:15px;font-weight:600;line-height:1.35">
          <a href="${frameworkHref(fw, base)}" style="color:#0f172a;text-decoration:none">${esc(fw.n.de)}</a>
        </p>
        <p style="margin:0;font-size:13px;line-height:1.55;color:#475569">${esc(fw.about.de)}</p>
      </td></tr>`)
    .join("");

  const srcItems = sources
    .map((s) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #f1f5f9">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;line-height:1.35">
          <a href="${esc(s.url)}" style="color:#0f172a;text-decoration:none">${esc(s.name)}</a>
        </p>
        <p style="margin:0;font-size:12px;color:#64748b">
          ${esc(s.authority)} &nbsp;·&nbsp; ${esc(JURISDICTION_LABEL[s.jurisdiction].de)}
        </p>
      </td></tr>`)
    .join("");

  const text = [
    "regulatoryradar",
    "",
    `Neu bei Regulatory Radar: ${heading}`,
    "",
    intro,
    "",
    ...(frameworks.length > 0 ? ["Neue Rahmenwerke", ""] : []),
    ...frameworks.flatMap((fw) => [
      `${fw.n.de} (${fw.ref}, ${JUR_LABEL[fw.jur]})`,
      `Relevant für: ${audiences(fw).join(", ")}`,
      fw.about.de,
      frameworkHref(fw, base),
      "",
    ]),
    ...(sources.length > 0 ? ["Neue Quellen", ""] : []),
    ...sources.flatMap((s) => [
      `${s.name} — ${s.authority}, ${JURISDICTION_LABEL[s.jurisdiction].de}`,
      s.url,
      "",
    ]),
    `Alle Quellen: ${base}/quellen`,
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
      Neu: ${esc(heading)}
    </h1>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#64748b">${esc(intro)}</p>
    ${frameworks.length > 0 ? `
    <p style="margin:24px 0 0;font-size:13px;font-weight:600;color:#94a3b8">Neue Rahmenwerke</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
      ${fwItems}
    </table>` : ""}
    ${sources.length > 0 ? `
    <p style="margin:24px 0 0;font-size:13px;font-weight:600;color:#94a3b8">Neue Quellen</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
      ${srcItems}
    </table>` : ""}
    <p style="margin:28px 0 16px">
      <a href="${base}/quellen"
         style="display:inline-block;white-space:nowrap;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;margin:0 8px 12px 0">
        Alle Quellen ansehen →
      </a>
      <a href="${base}/updates"
         style="display:inline-block;white-space:nowrap;color:#0f172a;border:1px solid #e2e8f0;padding:11px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;margin:0 0 12px 0">
        Aktuelle Updates →
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

export async function runFwNewsletter(opts: {
  dryRun?: boolean;
  onlyTo?: string;
  /** true = Versand wurde per Freigabe-Link autorisiert. Ohne dieses Flag
      verschickt ein regulärer Lauf (Cron) nur eine Freigabe-Anfrage an den
      Betreiber — nichts an den Verteiler. */
  approved?: boolean;
} = {}): Promise<FwRunReport> {
  const report: FwRunReport = {
    initialized: false, newFrameworks: 0, newSources: 0,
    recipients: 0, sent: 0, skipped: 0, dryRun: !!opts.dryRun, errors: [],
  };

  // Testversand (?to=) und Dry-Run verändern keinen Zustand.
  const writable = !opts.dryRun && !opts.onlyTo;
  const nowIso = new Date().toISOString();

  const { seen, first } = await loadSeen(writable, nowIso);

  if (first) {
    // Erstlauf: Bestand mit Epoch markiert, nichts verschicken.
    report.initialized = true;
    report.newFrameworks = FRAMEWORKS.length;
    report.newSources = SOURCES.length;
    return report;
  }

  let subs = await listSubscribers();
  if (opts.onlyTo) {
    const only = opts.onlyTo.toLowerCase();
    subs = subs.filter((s) => s.email === only);
    // Unbekannte Testadresse: Wasserzeichen Epoch → alles außer Erstbestand.
    if (subs.length === 0) subs = [{ email: only, providers: [], confirmedAt: EPOCH }];
  }
  report.recipients = subs.length;

  const base = process.env.APP_URL ?? "http://localhost:3000";

  // Freigabe-Gate: Ein regulärer Lauf (Cron, ohne approved/dry/to) verschickt
  // nichts an Abonnenten, sondern eine Vorschau mit Freigabe-Link an den
  // Betreiber. Erst der Klick ruft diesen Lauf mit approved=true erneut auf.
  if (!opts.approved && writable) {
    const pendingFw = new Map<string, Framework>();
    const pendingSrc = new Map<string, Source>();
    for (const sub of subs) {
      const watermark = [sub.confirmedAt || EPOCH, sub.lastFwNotifiedAt || EPOCH]
        .sort()
        .pop()!;
      for (const f of FRAMEWORKS) {
        if ((seen[`fw:${f.id}`] ?? nowIso) > watermark) pendingFw.set(f.id, f);
      }
      for (const s of SOURCES) {
        if ((seen[`src:${s.id}`] ?? nowIso) > watermark) pendingSrc.set(s.id, s);
      }
    }
    report.newFrameworks = pendingFw.size;
    report.newSources = pendingSrc.size;
    if (pendingFw.size === 0 && pendingSrc.size === 0) {
      report.skipped = subs.length;
      return report;
    }
    const fws = [...pendingFw.values()];
    const srcs = [...pendingSrc.values()];
    const { html } = renderFwNewsletter(fws, srcs, `${base}/api/unsubscribe?token=preview`, base);
    const summary = [
      fws.length > 0 ? `${fws.length} ${fws.length === 1 ? "Rahmenwerk" : "Rahmenwerke"}` : "",
      srcs.length > 0 ? `${srcs.length} ${srcs.length === 1 ? "Quelle" : "Quellen"}` : "",
    ].filter(Boolean).join(", ");
    await sendApprovalRequest("frameworks", `${summary} für ${subs.length} Empfänger`, html);
    report.pendingApproval = true;
    report.pendingItems = fws.length + srcs.length;
    return report;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { from, replyTo } = senderFields();
  const pace = createSendPacer(); // Resend: max. 2 Requests/Sekunde

  // Lauf-Sperre gegen parallele Freigabe-Klicks (Doppelklick, Mail-Scanner).
  if (writable && !(await acquireSendLock("frameworks"))) {
    report.locked = true;
    return report;
  }
  const startedAt = new Date().toISOString();
  const progress = async (done: boolean) => {
    if (!writable) return;
    await writeProgress({
      kind: "frameworks", total: report.recipients, sent: report.sent,
      skipped: report.skipped, errors: report.errors.length, done, startedAt,
    });
  };

  try {
    await progress(false);
    for (const sub of subs) {
      // Wasserzeichen: jüngster von Anmeldung und letzter Rahmenwerk-Mail.
      // Nur danach erstmals gesehene Zugänge sind für diesen Abonnenten neu —
      // Neuanmelder erhalten also keine Zugänge, die vor ihrer Registrierung
      // dazukamen. ISO-Strings (UTC) sind lexikografisch vergleichbar.
      const watermark = [sub.confirmedAt || EPOCH, sub.lastFwNotifiedAt || EPOCH]
        .sort()
        .pop()!;
      const freshFw = FRAMEWORKS.filter((f) => (seen[`fw:${f.id}`] ?? nowIso) > watermark);
      const freshSrc = SOURCES.filter((s) => (seen[`src:${s.id}`] ?? nowIso) > watermark);
      report.newFrameworks = Math.max(report.newFrameworks, freshFw.length);
      report.newSources = Math.max(report.newSources, freshSrc.length);
      if (freshFw.length === 0 && freshSrc.length === 0) {
        report.skipped++;
        continue;
      }
      if (opts.dryRun) {
        report.sent++;
        continue;
      }
      const unsubUrl = `${base}/api/unsubscribe?token=${encodeURIComponent(createUnsubToken(sub.email))}`;
      const parts = [
        freshFw.length > 0
          ? `${freshFw.length} ${freshFw.length === 1 ? "Rahmenwerk" : "Rahmenwerke"}`
          : "",
        freshSrc.length > 0
          ? `${freshSrc.length} ${freshSrc.length === 1 ? "Quelle" : "Quellen"}`
          : "",
      ].filter(Boolean).join(", ");
      const subject = `Neu bei Regulatory Radar: ${parts}`;
      const { html, text } = renderFwNewsletter(freshFw, freshSrc, unsubUrl, base);
      await pace();
      const { error } = await resend.emails.send({
        from,
        replyTo,
        to: sub.email,
        subject,
        html: addIdentifyParam(html, base, createIdToken(sub.email)),
        text,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (error) {
        // Wasserzeichen NICHT vorrücken — der nächste Lauf versucht es erneut.
        report.errors.push(`${sub.email}: ${error.message}`);
      } else {
        report.sent++;
        if (writable) await setLastFwNotified(sub.email, nowIso);
      }
      await progress(false);
    }

    if (writable && report.sent > 0) {
      await redis().set(LAST_SENT_KEY, nowIso);
    }
  } finally {
    if (writable) {
      await progress(true);
      await releaseSendLock("frameworks");
    }
  }

  return report;
}
