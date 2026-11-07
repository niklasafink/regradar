import { sendActivityReport } from "@/lib/relevance/activity";

// Abendbericht an den Betreiber: wer hat heute was mit der Einschlägigkeit
// gemacht (Vercel-Cron täglich 18:00 UTC). Ohne Nutzung keine Mail.
//   GET (Bearer CRON_SECRET)          → Bericht senden, Protokoll leeren
//   GET ?test=1 (Bearer CRON_SECRET)  → Vorschau, Protokoll bleibt
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const test = new URL(request.url).searchParams.get("test") === "1";
  try {
    return Response.json({ ok: true, ...(await sendActivityReport({ test })) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
