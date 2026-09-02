import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { PROVIDERS } from "./data";

const SECRET = process.env.SUBSCRIBE_SECRET ?? "dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 48; // Bestätigungslink 48h gültig

// Benachrichtigungs-Rhythmus des Update-Newsletters: "daily" = jeden Tag,
// sofern es neue Updates gibt; "weekly" = höchstens einmal pro Woche.
export type Frequency = "daily" | "weekly";

export type SubscribePayload = {
  email: string;
  providers: string[];
  freq: Frequency;
  exp: number;
};

function sign(data: string) {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createToken(
  email: string,
  providers: string[],
  freq: Frequency = "daily",
): string {
  const payload = Buffer.from(
    JSON.stringify({ email, providers, freq, exp: Date.now() + TOKEN_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): SubscribePayload | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as SubscribePayload & { provider?: string };
    if (typeof data.email !== "string" || Date.now() > data.exp) return null;
    // Alt-Tokens (bis 48h nach Umstellung) trugen ein einzelnes provider-Feld.
    if (!Array.isArray(data.providers)) {
      data.providers = data.provider ? [data.provider] : [];
    }
    // Alt-Tokens ohne freq-Feld gelten als täglich (bisheriges Verhalten).
    data.freq = data.freq === "weekly" ? "weekly" : "daily";
    return data;
  } catch {
    return null;
  }
}

// Identify-Token für Newsletter-Links: hängt an Site-Links in Abonnenten-Mails
// (?df=…). Beim Klick verknüpft /api/df die E-Mail server-seitig mit dem
// DataFast-Besucherprofil — so kommen auch Bestandsabonnenten unter "Users".
// Unbegrenzt gültig (wie der Abmelde-Link), eigener act-Wert gegen Missbrauch.
export function createIdToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), act: "df" }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyIdToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: string;
      act?: string;
    };
    return data.act === "df" && typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

/** Antwortadresse aller ausgehenden Mails. Seit 02.09.2026 empfängt Resend
    für regradar.de (MX → inbound-smtp.eu-west-1.amazonaws.com), daher ist die
    Absenderadresse selbst die Antwortadresse; /api/inbound leitet alles an den
    Betreiber weiter. Überschreibbar per RESEND_REPLY_TO. */
export function replyToAddress(): string {
  return process.env.RESEND_REPLY_TO ?? process.env.RESEND_FROM ?? "antwort@mordibo.resend.app";
}

/** Absender + Reply-To für alle ausgehenden Mails (eine Stelle statt zehn). */
export function senderFields(): { from: string; replyTo: string } {
  return {
    from: `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
    replyTo: replyToAddress(),
  };
}

// Resend erlaubt 2 API-Requests pro Sekunde. Massenversand-Loops holen sich
// einen Pacer und rufen ihn vor jedem Send auf; er wartet, bis seit dem
// letzten Aufruf mindestens `intervalMs` vergangen sind (600 ms ≈ 1,7/s,
// Puffer für parallele Einzelmails wie Freigabe-/Notify-Sends).
export function createSendPacer(intervalMs = 600): () => Promise<void> {
  let next = 0;
  return async () => {
    const wait = next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    next = Date.now() + intervalMs;
  };
}

// Freigabe-Token für den Newsletter-Versand: Der Cron verschickt zunächst nur
// eine Vorschau an den Betreiber; erst der Klick auf den Freigabe-Link (mit
// diesem Token) löst den Versand an den Verteiler aus. 7 Tage gültig, damit
// eine Montagsmail auch später in der Woche noch freigegeben werden kann.
export type ApproveKind = "updates" | "frameworks" | "praxis";

export const APPROVE_LABEL: Record<ApproveKind, string> = {
  updates: "Update-Newsletter",
  frameworks: "Rahmenwerk-Newsletter",
  praxis: "Praxis-Newsletter",
};
const APPROVE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function createApproveToken(kind: ApproveKind): string {
  const payload = Buffer.from(
    JSON.stringify({ act: "nl-approve", kind, exp: Date.now() + APPROVE_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyApproveToken(token: string): ApproveKind | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      act?: string;
      kind?: string;
      exp?: number;
    };
    if (data.act !== "nl-approve" || Date.now() > (data.exp ?? 0)) return null;
    return data.kind === "updates" || data.kind === "frameworks" || data.kind === "praxis"
      ? data.kind
      : null;
  } catch {
    return null;
  }
}

/** Adresse, die Newsletter vor dem Versand freigeben muss. */
export function approverAddress(): string {
  return (
    process.env.NEWSLETTER_APPROVER ??
    process.env.NOTIFY_EMAIL ??
    "niklas.fink@hotmail.de"
  );
}

/** Freigabe-Anfrage an den Betreiber: Zusammenfassung, Freigeben-Button und
    darunter die vollständige Vorschau der Newsletter-Mail. */
export async function sendApprovalRequest(
  kind: ApproveKind,
  summary: string,
  previewHtml: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY fehlt in web/.env.local");
  const resend = new Resend(apiKey);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const approveUrl = `${base}/api/newsletter/approve?token=${encodeURIComponent(
    createApproveToken(kind),
  )}`;
  const label = APPROVE_LABEL[kind];

  const { error } = await resend.emails.send({
    ...senderFields(),
    to: approverAddress(),
    subject: `Freigabe erforderlich: ${summary}`,
    text: `${label} wartet auf Freigabe: ${summary}

Freigeben (löst den Versand an alle Abonnenten aus):
${approveUrl}

Ohne Klick wird nichts verschickt. Der Link ist 7 Tage gültig; der nächste
Cron-Lauf erinnert mit einer neuen Vorschau, solange nichts freigegeben ist.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.5">
          <strong>${label} wartet auf Freigabe:</strong> ${summary}.<br>
          Erst dein Klick löst den Versand an den Verteiler aus — ohne Klick geht nichts raus.
        </p>
        <p style="margin:20px 0 28px">
          <a href="${approveUrl}"
             style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">
            Freigeben und an alle senden →
          </a>
        </p>
        <p style="color:#64748b;font-size:12px;margin:0 0 20px">
          Link 7 Tage gültig. Unten die Vorschau der Mail, wie Abonnenten sie
          (gefiltert nach ihren Anbietertypen) erhalten.
        </p>
        <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
          ${previewHtml}
        </div>
      </div>`,
  });
  if (error) throw new Error(error.message);
}

// Abmelde-Token: unbegrenzt gültig, damit der Link in alten Mails funktioniert.
export function createUnsubToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), act: "unsub" }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: string;
      act?: string;
    };
    return data.act === "unsub" && typeof data.email === "string"
      ? data.email
      : null;
  } catch {
    return null;
  }
}

// Rhythmus-Umschalter am Ende jeder Update-Mail: Ein Klick auf "täglich" bzw.
// "wöchentlich" stellt den Rhythmus ohne Login um. Der Token trägt Adresse
// und Ziel-Rhythmus, ist unbefristet gültig (wie der Abmelde-Link) und lässt
// sich nicht zum Abmelden missbrauchen (eigener act-Wert).
export function createFreqToken(email: string, freq: Frequency): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), act: "freq", freq }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyFreqToken(
  token: string,
): { email: string; freq: Frequency } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: string;
      act?: string;
      freq?: string;
    };
    if (data.act !== "freq" || typeof data.email !== "string") return null;
    if (data.freq !== "daily" && data.freq !== "weekly") return null;
    return { email: data.email, freq: data.freq };
  } catch {
    return null;
  }
}

export async function sendConfirmationEmail(
  email: string,
  providers: string[],
  providerLabels: string[] = [],
  freq: Frequency = "daily",
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY fehlt in web/.env.local");
  }
  const resend = new Resend(apiKey);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const confirmUrl = `${base}/api/confirm?token=${encodeURIComponent(
    createToken(email, providers, freq),
  )}`;
  const scope = providerLabels.length
    ? ` zu Updates für: <strong>${providerLabels.join(", ")}</strong>`
    : "";

  const textScope = providerLabels.length
    ? ` zu Updates für: ${providerLabels.join(", ")}`
    : "";

  const rhythm =
    freq === "weekly"
      ? "höchstens einmal pro Woche"
      : "täglich, sofern es neue Updates gibt";

  const { error } = await resend.emails.send({
    ...senderFields(),
    to: email,
    subject: "Bitte bestätigen: Update-Benachrichtigungen von Regulatory Radar",
    text: `regulatoryradar

bitte bestätigen Sie mit einem Klick, dass wir Sie kostenlos per E-Mail über neue regulatorische Updates${textScope} benachrichtigen dürfen (${rhythm}):

${confirmUrl}

Der Link ist 48 Stunden gültig. Wenn Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie einfach — es wird nichts gespeichert.

Impressum: ${base}/impressum
Datenschutz: ${base}/datenschutz`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>bitte bestätigen Sie mit einem Klick, dass wir Sie kostenlos per
        E-Mail über neue regulatorische Updates${scope} benachrichtigen dürfen
        (${rhythm}):</p>
        <p style="margin:28px 0">
          <a href="${confirmUrl}"
             style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">
            Benachrichtigungen aktivieren
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">Der Link ist 48 Stunden gültig.
        Wenn Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie einfach —
        es wird nichts gespeichert.</p>
        <p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8">
          <a href="${base}/impressum" style="color:#64748b">Impressum</a> &nbsp;
          <a href="${base}/datenschutz" style="color:#64748b">Datenschutz</a>
        </p>
      </div>`,
  });
  if (error) throw new Error(error.message);
}

// Interne Benachrichtigung an den Betreiber: beim Absenden des Formulars
// ("requested"), bei der ersten Bestätigung ("confirmed") und wenn ein
// bestehender Abonnent neue Quellen hinzufügt ("expanded"). Wiederholte
// Aufrufe desselben Bestätigungslinks (z. B. durch Mail-Scanner) ändern
// nichts mehr und lösen daher keine Mail aus.
const NOTIFY_TEXT = {
  requested: {
    subject: "Neue Anmeldung",
    line: "Neue Newsletter-Anmeldung (Bestätigungsmail verschickt)",
  },
  confirmed: {
    subject: "Abo bestätigt",
    line: "Newsletter-Anmeldung bestätigt",
  },
  expanded: {
    subject: "Abo erweitert",
    line: "Bestehender Abonnent hat neue Quellen hinzugefügt",
  },
} as const;

/** Interne Mail an den Betreiber nach einer Abmeldung. Bewusst ohne
    Löschpflicht-Details in der Mail; Hintergrund: Der Upstash-Eintrag ist zu
    diesem Zeitpunkt bereits gelöscht, das DataFast-Profil muss separat
    manuell entfernt werden (kein API-Delete). */
export async function sendUnsubscribeNotification(subscriberEmail: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const to = process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de";

  const { error } = await resend.emails.send({
    ...senderFields(),
    to,
    subject: `Abmeldung: ${subscriberEmail}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>Newsletter-Abmeldung:</p>
        <p><strong>${subscriberEmail}</strong></p>
        <p style="color:#64748b;font-size:13px">${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr</p>
      </div>`,
  });
  if (error) throw new Error(error.message);
}

/** Bestätigung an den Abonnenten selbst nach erfolgreicher Abmeldung — damit
    eine (z. B. versehentliche oder durch einen Link-Scanner ausgelöste)
    Abmeldung nicht unbemerkt bleibt. Enthält den Weg zurück zur Anmeldung. */
export async function sendUnsubscribeConfirmation(subscriberEmail: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const text = [
    "regulatoryradar",
    "",
    "Sie wurden abgemeldet.",
    `${subscriberEmail} erhält ab sofort keine Update-Benachrichtigungen mehr von Regulatory Radar.`,
    "",
    `Das war ein Versehen? Sie können sich jederzeit neu anmelden: ${base}/#newsletter`,
    "",
    `Impressum: ${base}/impressum`,
    `Datenschutz: ${base}/datenschutz`,
  ].join("\n");
  const { error } = await resend.emails.send({
    ...senderFields(),
    to: subscriberEmail,
    subject: "Sie wurden abgemeldet – Regulatory Radar",
    text,
    html: `
      <div style="background:#ffffff;padding:32px 16px">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="margin:0 0 28px;font-size:18px"><strong>regulatory</strong><em style="font-weight:300">radar</em></p>
        <h1 style="margin:0 0 12px;font-size:24px;font-weight:500;letter-spacing:-0.02em">Sie wurden abgemeldet.</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">
          <strong style="color:#0f172a">${subscriberEmail}</strong> erhält ab sofort keine
          Update-Benachrichtigungen mehr von Regulatory Radar.
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569">Das war ein Versehen?</p>
        <p style="margin:0 0 32px">
          <a href="${base}/#newsletter"
             style="display:inline-block;white-space:nowrap;background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px">
            Erneut anmelden →
          </a>
        </p>
        <p style="margin:0;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.6">
          <a href="${base}/impressum" style="color:#64748b">Impressum</a> &nbsp;
          <a href="${base}/datenschutz" style="color:#64748b">Datenschutz</a>
        </p>
      </div>
      </div>`,
  });
  if (error) throw new Error(error.message);
}

export async function sendSubscriberNotification(
  subscriberEmail: string,
  providers: string[],
  stage: keyof typeof NOTIFY_TEXT,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const to = process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de";
  // Interne IDs ("CI", "IF") ausschreiben ("Bank / Kreditinstitut", …).
  const labels = providers.map(
    (id) => PROVIDERS.find((p) => p.id === id)?.n.de ?? id,
  );

  const { error } = await resend.emails.send({
    ...senderFields(),
    to,
    subject: `${NOTIFY_TEXT[stage].subject}: ${subscriberEmail}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>${NOTIFY_TEXT[stage].line}:</p>
        <p><strong>${subscriberEmail}</strong></p>
        <p>Zielgruppen: ${labels.join(", ") || "—"}</p>
        <p style="color:#64748b;font-size:13px">${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr</p>
      </div>`,
  });
  if (error) throw new Error(error.message);
}
