import { logActivity } from "@/lib/relevance/activity";
import { ecbByLei, ecbLookup, searchEcb, searchEiopa, searchRegistryFuzzy } from "@/lib/relevance/registry";
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
    // Deutsches Register, dazu Banken des übrigen Euroraums (EZB-Liste) und
    // Versicherer des übrigen EWR (EIOPA-Register).
    const hits = [...(await searchRegistryFuzzy(q)), ...searchEcb(q), ...searchEiopa(q)];
    await logActivity(request, "Institutssuche", q);
    return Response.json({
      hits: hits.map((h) => {
        const ecb = h.id.startsWith("ecb:") ? ecbByLei(h.id.slice(4)) : h.id.startsWith("eiopa:") ? undefined : ecbLookup(h.name);
        return { ...h, ecb: ecb ? { si: ecb.si, hi: ecb.hi, type: ecb.type } : null };
      }),
    });
  } catch (e) {
    console.error("registry search failed:", e);
    return Response.json({ hits: [], error: "Suche derzeit nicht verfügbar." }, { status: 502 });
  }
}
