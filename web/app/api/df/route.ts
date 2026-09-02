import { datafastVisitorId, identifyDatafastVisitor } from "@/lib/datafast";
import { verifyIdToken } from "@/lib/email";

/* Wertet den Identify-Token aus Newsletter-Links (?df=…) aus: Der Client
   schickt ihn nach dem Seitenaufruf hierher; wir verknüpfen die E-Mail mit
   dem DataFast-Besucherprofil (Cookie kommt im selben Request mit). Antwortet
   immer 204 — auch bei ungültigem Token, nichts davon soll den Besuch stören. */
export async function POST(request: Request) {
  let token = "";
  try {
    token = ((await request.json()) as { token?: string }).token ?? "";
  } catch {
    return new Response(null, { status: 204 });
  }
  const email = verifyIdToken(token);
  if (email) {
    await identifyDatafastVisitor(email, datafastVisitorId(request), {
      source: "newsletter_link",
    });
  }
  return new Response(null, { status: 204 });
}
