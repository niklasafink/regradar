import { createMagicLink, isEmail } from "@/lib/accounts";
import { sanitizeProfile } from "@/lib/relevance/profile";
import { rateLimit, sendMagicLinkMail } from "@/lib/relevance/server";

/* Magic Link anfordern; ein Profil-Entwurf aus dem Browser wird mitgegeben
   und beim Einlösen im Konto gespeichert. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; profile?: unknown };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) return Response.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, { status: 400 });
  if (!(await rateLimit(request, "magic", 10))) {
    return Response.json({ error: "Zu viele Anmeldeversuche, bitte später erneut versuchen." }, { status: 429 });
  }
  const draft = sanitizeProfile(body.profile) ?? undefined;
  const token = await createMagicLink(email, draft);
  try {
    await sendMagicLinkMail(email, token);
  } catch (e) {
    console.error("magic link mail failed:", e);
    return Response.json({ error: "E-Mail konnte nicht versendet werden." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
