import { logActivity } from "@/lib/relevance/activity";
import { ecbLookup, searchRegistry } from "@/lib/relevance/registry";
import { rateLimit } from "@/lib/relevance/server";

/* Institutssuche für den Profil-Ablauf: Treffer mit Gattung und, falls
   vorhanden, Aufsichtsstatus aus der EZB-Liste. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json({ hits: [] });
  if (!(await rateLimit(request, "search", 120))) {
    return Response.json({ error: "Zu viele Anfragen, bitte später erneut versuchen." }, { status: 429 });
  }
  try {
    const hits = await searchRegistry(q);
    await logActivity(request, "Institutssuche", q);
    return Response.json({
      hits: hits.map((h) => {
        const ecb = ecbLookup(h.name);
        return { ...h, ecb: ecb ? { si: ecb.si, hi: ecb.hi, type: ecb.type } : null };
      }),
    });
  } catch (e) {
    console.error("registry search failed:", e);
    return Response.json({ hits: [], error: "Suche derzeit nicht verfügbar." }, { status: 502 });
  }
}
