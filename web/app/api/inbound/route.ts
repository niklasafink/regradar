// Eingehende Antworten auf unsere Mails. Alle ausgehenden Mails tragen als
// Reply-To die Resend-Empfangsadresse (siehe replyToAddress in lib/email.ts).
// Resend nimmt die Antwort entgegen und ruft diesen Webhook mit dem Event
// "email.received" auf (nur Metadaten, kein Inhalt). Wir holen den Inhalt
// per API nach und leiten die Mail an den Betreiber weiter — mit Reply-To
// auf den ursprünglichen Absender, sodass "Antworten" im Postfach direkt an
// den Abonnenten geht.
//
// Webhook in Resend (angelegt 02.09.2026, ID 230c433c-…): Endpoint
// https://www.regradar.de/api/inbound (Apex leitet per 308 auf www um),
// Event "email.received"; Signing Secret in
// RESEND_WEBHOOK_SECRET. Ohne Secret wird die Signatur nicht geprüft (nur für
// lokale Tests). RESEND_API_KEY ist send-only — zum Abrufen der empfangenen
// Mail braucht es den Lesekey RESEND_METRICS_API_KEY.
import { Resend } from "resend";
import { senderFields } from "@/lib/email";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // Resend-Limit ca. 40 MB je Mail

function inboxAddress(): string {
  return process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de";
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export async function POST(request: Request) {
  const sendKey = process.env.RESEND_API_KEY;
  const readKey = process.env.RESEND_METRICS_API_KEY ?? sendKey;
  if (!sendKey || !readKey) return new Response("RESEND_API_KEY fehlt", { status: 500 });
  const resend = new Resend(sendKey);
  const reader = new Resend(readKey);

  const raw = await request.text();
  let event: { type?: string; data?: { email_id?: string } };
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    try {
      event = resend.webhooks.verify({
        payload: raw,
        webhookSecret: secret,
        headers: {
          id: request.headers.get("svix-id") ?? "",
          timestamp: request.headers.get("svix-timestamp") ?? "",
          signature: request.headers.get("svix-signature") ?? "",
        },
      }) as typeof event;
    } catch (e) {
      console.error("inbound: ungültige Webhook-Signatur", e);
      return new Response("invalid signature", { status: 401 });
    }
  } else {
    try {
      event = JSON.parse(raw);
    } catch {
      return new Response("invalid json", { status: 400 });
    }
  }

  if (event.type !== "email.received" || !event.data?.email_id) {
    return Response.json({ ok: true, ignored: true });
  }
  const emailId = event.data.email_id;

  const { data: mail, error: getError } = await reader.emails.receiving.get(emailId);
  if (getError || !mail) {
    console.error("inbound: Abruf fehlgeschlagen", getError);
    return new Response(`get failed: ${getError?.message ?? "unknown"}`, { status: 500 });
  }

  // Anhänge mitnehmen (bis zur Größengrenze); der Rest wird nur aufgelistet.
  const attachments: { filename: string; content: Buffer; contentType?: string; contentId?: string }[] = [];
  const skipped: string[] = [];
  for (const att of mail.attachments ?? []) {
    const name = att.filename ?? att.id;
    if (att.size > MAX_ATTACHMENT_BYTES) {
      skipped.push(name);
      continue;
    }
    try {
      const { data: meta } = await reader.emails.receiving.attachments.get({ emailId, id: att.id });
      const url = meta?.download_url;
      if (!url) throw new Error("kein download_url");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      attachments.push({
        filename: name,
        content: Buffer.from(await res.arrayBuffer()),
        contentType: att.content_type,
        contentId: att.content_id ?? undefined,
      });
    } catch (e) {
      console.error("inbound: Anhang übersprungen", name, e);
      skipped.push(name);
    }
  }

  const received = new Date(mail.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const toList = (mail.to ?? []).join(", ");
  const skippedNote = skipped.length
    ? `Nicht übernommene Anhänge (zu groß/fehlgeschlagen): ${skipped.join(", ")}`
    : "";
  const headerText = [
    `Antwort an Regulatory Radar`,
    `Von: ${mail.from}`,
    `An: ${toList}`,
    `Empfangen: ${received} Uhr`,
    skippedNote,
    "",
    "----------------------------------------",
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  const headerHtml = `
    <div style="font-family:system-ui,sans-serif;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px">
      <p style="margin:0 0 4px;font-size:15px;color:#0f172a"><strong>Antwort an Regulatory Radar</strong></p>
      <p style="margin:0">Von: <strong style="color:#0f172a">${esc(mail.from)}</strong></p>
      <p style="margin:0">An: ${esc(toList)}</p>
      <p style="margin:0">Empfangen: ${esc(received)} Uhr</p>
      ${skippedNote ? `<p style="margin:8px 0 0;color:#b45309">${esc(skippedNote)}</p>` : ""}
      <p style="margin:8px 0 0;color:#94a3b8">„Antworten“ geht direkt an den Absender.</p>
    </div>`;

  const bodyHtml = mail.html ?? (mail.text ? `<pre style="white-space:pre-wrap;font-family:inherit">${esc(mail.text)}</pre>` : "<p><em>(kein Inhalt)</em></p>");
  const bodyText = mail.text ?? "(nur HTML-Inhalt, siehe HTML-Ansicht)";
  const subject = mail.subject?.trim() || "(kein Betreff)";

  const { from } = senderFields();
  const { data, error } = await resend.emails.send({
    from,
    to: inboxAddress(),
    replyTo: mail.from,
    subject: `Antwort: ${subject}`,
    html: headerHtml + bodyHtml,
    text: headerText + bodyText,
    attachments: attachments.length ? attachments : undefined,
  });
  if (error) {
    console.error("inbound: Weiterleitung fehlgeschlagen", error);
    return new Response(`forward failed: ${error.message}`, { status: 500 });
  }
  return Response.json({ ok: true, id: data?.id });
}
