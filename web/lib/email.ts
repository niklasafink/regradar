import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

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

Der Link ist 48 Stunden gültig. Wenn Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie einfach — es wird nichts gespeichert.`,
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

export async function sendSubscriberNotification(
  subscriberEmail: string,
  providers: string[],
  stage: keyof typeof NOTIFY_TEXT,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const to = process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de";

  const { error } = await resend.emails.send({
    from: `Niklas von RegRadar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
    to,
    subject: `${NOTIFY_TEXT[stage].subject}: ${subscriberEmail}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>${NOTIFY_TEXT[stage].line}:</p>
        <p><strong>${subscriberEmail}</strong></p>
        <p>Quellen: ${providers.join(", ") || "—"}</p>
        <p style="color:#64748b;font-size:13px">${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr</p>
      </div>`,
  });
  if (error) throw new Error(error.message);
}
