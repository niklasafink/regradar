import { cookies } from "next/headers";
import { after } from "next/server";
import {
  SESSION_COOKIE, SUB_COOKIE, consumeMagicLink, createSession, peekMagicLink,
  sessionCookieOptions, subCookieOptions, subCookieValue,
} from "@/lib/accounts";
import { logActivity } from "@/lib/relevance/activity";
import { prefillProfile, saveAndReconcile } from "@/lib/relevance/server";

// Nach dem Anmelden mit Profil läuft die Einschlägigkeit einmal komplett.
export const maxDuration = 300;
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
    try {
      const { profile } = await saveAndReconcile(v.email, v.draft);
      after(() => prefillProfile(profile, 270_000).catch((e) => console.error("prefill failed:", e)));
    } catch (e) { console.error("save draft failed:", e); }
  }
  await logActivity(request, "Angemeldet", v.draft ? `Profil ${v.draft.name} gespeichert` : undefined, v.email);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(v.email), sessionCookieOptions);
  jar.set(SUB_COOKIE, subCookieValue(v.email), subCookieOptions);
  return Response.redirect(`${base}/profil?login=ok`, 303);
}
