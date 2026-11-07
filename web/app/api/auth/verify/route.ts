import { cookies } from "next/headers";
import {
  SESSION_COOKIE, SUB_COOKIE, consumeMagicLink, createSession, peekMagicLink, saveProfile,
  sessionCookieOptions, subCookieOptions, subCookieValue,
} from "@/lib/accounts";
import { confirmPage, formBody, htmlPage } from "@/lib/confirmPage";

/* Magic Link: GET zeigt nur eine Bestätigungsseite (Mail-Scanner rufen Links
   automatisch auf), erst der POST aus dem Browser meldet an. */
export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  const v = await peekMagicLink(t);
  if (!v) {
    return htmlPage("Link abgelaufen",
      `<p style="font-size:14px;color:#475569">Der Anmeldelink ist abgelaufen oder wurde schon verwendet.
       <a href="/profil" style="color:#0f172a">Neuen Link anfordern</a>.</p>`, 410);
  }
  return confirmPage({
    title: "Anmelden",
    text: `Anmelden als <strong>${v.email.replace(/</g, "&lt;")}</strong>.`,
    action: "/api/auth/verify",
    button: "Jetzt anmelden",
    fields: { t, confirm: "1" },
    cancelHref: "/",
  });
}

export async function POST(request: Request) {
  const form = await formBody(request);
  const base = process.env.APP_URL ?? new URL(request.url).origin;
  const v = await consumeMagicLink(form.get("t") ?? "");
  if (!v) return Response.redirect(`${base}/profil?login=abgelaufen`, 303);
  if (v.draft) {
    try { await saveProfile(v.email, v.draft); } catch (e) { console.error("save draft failed:", e); }
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(v.email), sessionCookieOptions);
  jar.set(SUB_COOKIE, subCookieValue(v.email), subCookieOptions);
  return Response.redirect(`${base}/profil?login=ok`, 303);
}
