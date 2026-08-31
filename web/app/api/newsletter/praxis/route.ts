// Monatlicher Praxis-Newsletter (Aufsichtspraxis des Vormonats, aggregiert).
// Aufruf durch Vercel Cron (vercel.json, Monatserster) oder manuell:
//   GET /api/newsletter/praxis                     → Freigabe-Anfrage bzw. Versand
//   GET /api/newsletter/praxis?dry=1               → nur Report
//   GET /api/newsletter/praxis?to=mail@example.com → Testversand nur an diese
//       Adresse (markiert nichts als versandt)
//   GET /api/newsletter/praxis?preview=1           → HTML-Vorschau im Browser
//
// Auth wie bei den anderen Newslettern: "Authorization: Bearer <CRON_SECRET>"
// oder ?secret=<CRON_SECRET>.

import {
  itemsForMonth, previousMonthKey, renderPraxisNewsletter, runPraxisNewsletter,
} from "@/lib/praxisNewsletter";

export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET fehlt" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}` && url.searchParams.get("secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (url.searchParams.get("preview") === "1") {
    const base = process.env.APP_URL ?? url.origin;
    const month = previousMonthKey();
    const { html } = renderPraxisNewsletter(
      month,
      itemsForMonth(month),
      `${base}/api/unsubscribe?token=preview`,
      base,
    );
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  try {
    const report = await runPraxisNewsletter({
      dryRun: url.searchParams.get("dry") === "1",
      onlyTo: url.searchParams.get("to") ?? undefined,
    });
    return Response.json(report);
  } catch (e) {
    console.error("praxis newsletter failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
