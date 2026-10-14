import { PROVIDERS } from "@/lib/data";
import { datafastVisitorId, identifyDatafastVisitor } from "@/lib/datafast";
import { sendConfirmationEmail, sendSubscriberNotification } from "@/lib/email";
import { framePath, frameworkById } from "@/lib/logic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Obergrenze der Rahmenwerk-Auswahl (schützt Token-Länge und Redis-Eintrag).
const MAX_FRAMEWORKS = 50;

export async function POST(request: Request) {
  let body: {
    email?: string;
    providers?: string[];
    provider?: string;
    frequency?: string;
    frameworks?: string[];
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
  // Optionale Rahmenwerk-Auswahl: nur bekannte IDs, ohne Dubletten.
  const fws = (Array.isArray(body.frameworks) ? body.frameworks : [])
    .filter((id): id is string => typeof id === "string")
    .map(frameworkById)
    .filter((f, i, all) => f && all.indexOf(f) === i)
    .slice(0, MAX_FRAMEWORKS)
    .map((f) => f!);
  // Institutsart ist nur Pflicht, wenn kein Rahmenwerk gewählt wurde.
  if (chosen.length === 0 && fws.length === 0) {
    return Response.json({ error: "no_provider" }, { status: 400 });
  }
  const fwIds = fws.map((f) => f.id);
  const fwLabels = fws.map((f) => framePath("de", f));
  // Unbekannte Werte fallen auf das bisherige Verhalten (täglich) zurück.
  const frequency = body.frequency === "weekly" ? "weekly" : "daily";

  try {
    await sendConfirmationEmail(
      email,
      chosen.map((p) => p.id),
      chosen.map((p) => p.n.de),
      frequency,
      fwIds,
      fwLabels,
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
      fwLabels,
    );
  } catch (e) {
    // Benachrichtigung darf die Anmeldung nicht blockieren.
    console.error("subscriber notification failed:", e);
  }
  return Response.json({ ok: true });
}
