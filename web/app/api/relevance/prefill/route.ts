import { prefillAll } from "@/lib/relevance/server";

// Stundenlauf (scraper/relevance_prefill.py): für alle Kontoprofile
// Profiländerungen abgleichen und fehlende Paare einmal prüfen (neue Updates,
// unterbrochene Komplettläufe). Bereits gespeicherte Paare kosten nichts.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const res = await prefillAll(270_000);
  return Response.json({ ok: true, ...res });
}
