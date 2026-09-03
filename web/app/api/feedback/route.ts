// Feedback-Widget (components/feedback-widget.tsx): Nutzer schreibt, was
// fehlt oder besser sein könnte, und gibt anschließend seine E-Mail an. Die
// Nachricht geht per Resend an den Betreiber (NOTIFY_EMAIL) mit Reply-To auf
// den Absender, sodass „Antworten" im Postfach direkt beim Nutzer landet.
import { Resend } from "resend";
import { senderFields } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 4000;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export async function POST(request: Request) {
  let body: { message?: string; email?: string; page?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  // Honeypot: echte Nutzer füllen das unsichtbare Feld nicht aus.
  if (body.website) return Response.json({ ok: true });

  const message = (body.message ?? "").trim();
  const email = (body.email ?? "").trim();
  const page = (body.page ?? "").trim().slice(0, 300);
  if (!message) return Response.json({ error: "empty_message" }, { status: 400 });
  if (message.length > MAX_MESSAGE) return Response.json({ error: "too_long" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return Response.json({ error: "not_configured" }, { status: 500 });
  const resend = new Resend(apiKey);

  const received = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const pageUrl = page ? `${process.env.APP_URL ?? "https://www.regradar.de"}${page}` : "";
  const text = [
    `Feedback über das Widget auf regradar.de`,
    `Von: ${email}`,
    pageUrl ? `Seite: ${pageUrl}` : "",
    `Eingegangen: ${received} Uhr`,
    "",
    "----------------------------------------",
    "",
    message,
  ]
    .filter((l) => l !== "")
    .join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;color:#0f172a">
      <div style="font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px">
        <p style="margin:0 0 4px;font-size:15px;color:#0f172a"><strong>Feedback über das Widget</strong></p>
        <p style="margin:0">Von: <strong style="color:#0f172a">${esc(email)}</strong></p>
        ${pageUrl ? `<p style="margin:0">Seite: <a href="${esc(pageUrl)}" style="color:#0f172a">${esc(pageUrl)}</a></p>` : ""}
        <p style="margin:0">Eingegangen: ${esc(received)} Uhr</p>
        <p style="margin:8px 0 0;color:#94a3b8">„Antworten“ geht direkt an den Absender.</p>
      </div>
      <p style="white-space:pre-wrap;font-size:15px;line-height:1.5;margin:0">${esc(message)}</p>
    </div>`;

  const { from } = senderFields();
  const { error } = await resend.emails.send({
    from,
    to: process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de",
    replyTo: email,
    subject: `Feedback von ${email}`,
    text,
    html,
  });
  if (error) {
    console.error("feedback: Versand fehlgeschlagen", error);
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
