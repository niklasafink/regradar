import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { PROVIDERS } from "./data";

const SECRET = process.env.SUBSCRIBE_SECRET ?? "dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 48; // Bestätigungslink 48h gültig

export type SubscribePayload = {
  email: string;
  providers: string[];
  exp: number;
};

function sign(data: string) {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createToken(email: string, providers: string[]): string {
  const payload = Buffer.from(
    JSON.stringify({ email, providers, exp: Date.now() + TOKEN_TTL_MS }),
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
    return data;
  } catch {
    return null;
  }
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
    from: `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
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

export async function sendConfirmationEmail(
  email: string,
  providers: string[],
  providerLabels: string[] = [],
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY fehlt in web/.env.local");
  }
  const resend = new Resend(apiKey);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const confirmUrl = `${base}/api/confirm?token=${encodeURIComponent(
    createToken(email, providers),
  )}`;
  const scope = providerLabels.length
    ? ` zu Updates für: <strong>${providerLabels.join(", ")}</strong>`
    : "";

  const textScope = providerLabels.length
    ? ` zu Updates für: ${providerLabels.join(", ")}`
    : "";

  const { error } = await resend.emails.send({
    from: `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
    to: email,
    subject: "Bitte bestätigen: Update-Benachrichtigungen von Regulatory Radar",
    text: `regulatoryradar

bitte bestätigen Sie mit einem Klick, dass wir Sie kostenlos per E-Mail über neue regulatorische Updates${textScope} benachrichtigen dürfen:

${confirmUrl}

Der Link ist 48 Stunden gültig. Wenn Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie einfach — es wird nichts gespeichert.

Impressum: ${base}/impressum
Datenschutz: ${base}/datenschutz`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>bitte bestätigen Sie mit einem Klick, dass wir Sie kostenlos per
        E-Mail über neue regulatorische Updates${scope} benachrichtigen dürfen:</p>
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
    from: `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
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
    from: `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
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
