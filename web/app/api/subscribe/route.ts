import { PROVIDERS } from "@/lib/data";
import { datafastVisitorId, identifyDatafastVisitor } from "@/lib/datafast";
import { sendConfirmationEmail, sendSubscriberNotification } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: {
    email?: string;
    providers?: string[];
    provider?: string;
    frequency?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const email = body.email?.trim() ?? "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  const raw = Array.isArray(body.providers)
    ? body.providers
    : body.provider
      ? [body.provider]
      : [];
  // ID ("CI") oder URL-Slug ("bank") akzeptieren; gespeichert wird immer die ID.
  const chosen = PROVIDERS.filter(
    (p) => raw.includes(p.id) || raw.includes(p.slug),
  );
  if (chosen.length === 0) {
    return Response.json({ error: "no_provider" }, { status: 400 });
  }
  // Unbekannte Werte fallen auf das bisherige Verhalten (täglich) zurück.
  const frequency = body.frequency === "weekly" ? "weekly" : "daily";

  try {
    await sendConfirmationEmail(
      email,
      chosen.map((p) => p.id),
      chosen.map((p) => p.n.de),
      frequency,
    );
  } catch (e) {
    console.error("subscribe failed:", e);
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
  // Server-seitiges Identify (Adblocker-sicher): der Abonnieren-Klick gilt per
  // Hinweis unterm Formular als Analyse-Einwilligung, analog zum Client-Identify.
  await identifyDatafastVisitor(email.toLowerCase(), datafastVisitorId(request), {
    source: "newsletter",
  });
  try {
    await sendSubscriberNotification(
      email,
      chosen.map((p) => p.id),
      "requested",
    );
  } catch (e) {
    // Benachrichtigung darf die Anmeldung nicht blockieren.
    console.error("subscriber notification failed:", e);
  }
  return Response.json({ ok: true });
}
