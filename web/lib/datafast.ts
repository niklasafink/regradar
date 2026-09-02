// Server-seitiges DataFast-Identify (https://datafa.st/docs/api/website/identity/identify).
// Adblocker-sicher: Der Browser-Aufruf via script.js wird oft geblockt, der
// Server-Call nie. Läuft nur, wenn DATAFAST_API_KEY gesetzt ist und der
// Request das Besucher-Cookie mitbringt; Fehler blockieren nie die Anmeldung.

/* Hängt den Identify-Token (?df=…) an alle Site-Links einer Newsletter-Mail.
   Nur an Seiten-Links ohne bestehende Query — /api/-Links (Abmelden, Rhythmus)
   tragen bereits ?token= und bleiben unberührt. Nur im HTML-Teil verwenden;
   im Plain-Text blieben die langen Token-URLs unleserlich. */
export function addIdentifyParam(html: string, base: string, token: string): string {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const df = encodeURIComponent(token);
  return html.replace(
    new RegExp(`href="(${escaped}(?:/[^"?#]*)?)(#[^"]*)?"`, "g"),
    (match, url: string, hash: string = "") =>
      url.includes("/api/") ? match : `href="${url}?df=${df}${hash}"`,
  );
}

export function datafastVisitorId(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)datafast_visitor_id=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function identifyDatafastVisitor(
  userId: string,
  visitorId: string | null,
  metadata: Record<string, string> = {},
): Promise<void> {
  const apiKey = process.env.DATAFAST_API_KEY;
  if (!apiKey || !visitorId) return;
  try {
    const res = await fetch("https://datafa.st/api/v1/identify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        datafast_visitor_id: visitorId,
        email: userId,
        ...metadata,
      }),
    });
    if (!res.ok) {
      console.error("datafast identify failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("datafast identify failed:", e);
  }
}
