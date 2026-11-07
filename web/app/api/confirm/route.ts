import { after } from "next/server";
import { SUB_COOKIE, subCookieOptions, subCookieValue } from "@/lib/accounts";
import { sendSubscriberNotification, verifyToken } from "@/lib/email";
import { ensureDomainProfile } from "@/lib/relevance/server";
import { framePath, frameworkById, providerSlug } from "@/lib/logic";
import { addSubscriber } from "@/lib/subscribers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const data = verifyToken(token);
  const base = process.env.APP_URL ?? url.origin;

  if (!data) {
    return Response.redirect(`${base}/?abo=invalid`, 302);
  }
  const result = await addSubscriber(data.email, data.providers, data.frameworks);
  // "unchanged" (wiederholter Aufruf desselben Links durch Mail-Scanner
  // oder Reload) löst keine Mail aus.
  if (result !== "unchanged") {
    try {
      await sendSubscriberNotification(
        data.email,
        data.providers,
        result === "new" ? "confirmed" : "expanded",
        data.frameworks.map((id) => {
          const f = frameworkById(id);
          return f ? framePath("de", f) : id;
        }),
      );
    } catch (e) {
      // Benachrichtigung darf die Bestätigung nicht blockieren.
      console.error("subscriber notification failed:", e);
    }
  }
  // Vorprofil der Mail-Domain im Hintergrund anlegen (Einschlägigkeit).
  after(async () => {
    try { await ensureDomainProfile(data.email); } catch (e) { console.error("domain profile failed:", e); }
  });
  const target = data.providers[0] ? `/r/${providerSlug(data.providers[0])}` : "/";
  // Response.redirect hat unveränderliche Header; eigene Antwort mit Cookie.
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${base}${target}?abo=ok`,
      "Set-Cookie": `${SUB_COOKIE}=${subCookieValue(data.email)}; Path=/; Max-Age=${subCookieOptions.maxAge}; HttpOnly; SameSite=Lax${subCookieOptions.secure ? "; Secure" : ""}`,
    },
  });
}
