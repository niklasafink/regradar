import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

const SECRET = process.env.SUBSCRIBE_SECRET ?? "dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 48; // Bestätigungslink 48h gültig

export type SubscribePayload = {
  email: string;
  provider: string;
  exp: number;
};

function sign(data: string) {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createToken(email: string, provider: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, provider, exp: Date.now() + TOKEN_TTL_MS }),
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
    ) as SubscribePayload;
    if (typeof data.email !== "string" || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export async function sendConfirmationEmail(email: string, provider: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY fehlt in web/.env.local");
  }
  const resend = new Resend(apiKey);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const confirmUrl = `${base}/api/confirm?token=${encodeURIComponent(
    createToken(email, provider),
  )}`;

  const { error } = await resend.emails.send({
    from: `Regulatory Radar <${process.env.RESEND_FROM ?? "onboarding@resend.dev"}>`,
    to: email,
    subject: "Bitte bestätigen: Update-Benachrichtigungen von Regulatory Radar",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>bitte bestätigen Sie mit einem Klick, dass wir Sie kostenlos per
        E-Mail über neue regulatorische Updates benachrichtigen dürfen:</p>
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
