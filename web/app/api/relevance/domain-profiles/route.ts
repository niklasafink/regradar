import { listSubscribers } from "@/lib/subscribers";
import { domainOf, getDomainProfile } from "@/lib/accounts";
import { ensureDomainProfile } from "@/lib/relevance/server";

export const maxDuration = 300;

/* Vorprofile für die Mail-Domains aller Abonnenten anlegen (Nachlauf).
   Auth: "Authorization: Bearer <CRON_SECRET>". ?limit=N Domains je Aufruf. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "20");
  const subs = await listSubscribers();
  const domains = [...new Set(subs.map((s) => domainOf(s.email)).filter(Boolean))];
  const done: { domain: string; kind: string; name?: string }[] = [];
  let skipped = 0;
  for (const d of domains) {
    if (done.length >= limit) break;
    if (await getDomainProfile(d)) { skipped++; continue; }
    try {
      const dp = await ensureDomainProfile(`x@${d}`);
      done.push({ domain: d, kind: dp?.kind ?? "?", name: dp?.profile?.name });
    } catch (e) {
      done.push({ domain: d, kind: `fehler: ${e instanceof Error ? e.message : e}` });
    }
  }
  return Response.json({ domains: domains.length, skipped, done });
}
