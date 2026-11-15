import { datafastVisitorId, identifyDatafastVisitor } from "@/lib/datafast";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SUB_COOKIE, subCookieOptions, subCookieValue } from "@/lib/accounts";
import { verifyIdToken } from "@/lib/email";
import { ensureDomainProfile } from "@/lib/relevance/server";

/* Wertet den Identify-Token aus Newsletter-Links (?df=…) aus: Der Client
   schickt ihn nach dem Seitenaufruf hierher; wir verknüpfen die E-Mail mit
   dem DataFast-Besucherprofil (Cookie kommt im selben Request mit). Ungültige
   Token bekommen 204, nichts davon soll den Besuch stören. */
export async function POST(request: Request) {
  let token = "";
  try {
    token = ((await request.json()) as { token?: string }).token ?? "";
  } catch {
    return new Response(null, { status: 204 });
  }
  const email = verifyIdToken(token);
  if (email) {
    // Abonnenten-Cookie für das Vorprofil der Mail-Domain (Einschlägigkeit).
    (await cookies()).set(SUB_COOKIE, subCookieValue(email), subCookieOptions);
    after(async () => {
      try { await ensureDomainProfile(email); } catch (e) { console.error("domain profile failed:", e); }
    });
    await identifyDatafastVisitor(email, datafastVisitorId(request), {
      source: "newsletter_link",
    });
  }
  // Die Adresse geht nur an den zurück, der den signierten Token aus seiner
  // eigenen Mail vorlegt; /profil füllt damit das Anmeldefeld vor.
  return email ? Response.json({ email }) : new Response(null, { status: 204 });
}
