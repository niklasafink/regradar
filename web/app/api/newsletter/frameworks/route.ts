// Wöchentlicher Rahmenwerk-/Quellen-Newsletter ("Neu in der Datenbank").
// Aufruf durch Vercel Cron (vercel.json, montags) oder manuell:
//   GET /api/newsletter/frameworks                     → echter Versand
//   GET /api/newsletter/frameworks?dry=1               → nur Report
//   GET /api/newsletter/frameworks?to=mail@example.com → Testversand nur an
//       diese Adresse (markiert nichts als versandt)
//   GET /api/newsletter/frameworks?preview=1           → HTML-Vorschau im
//       Browser, kein Versand
//
// Auth wie beim Update-Newsletter: "Authorization: Bearer <CRON_SECRET>"
// oder ?secret=<CRON_SECRET>.

import { FRAMEWORKS } from "@/lib/data";
import { renderFwNewsletter, runFwNewsletter } from "@/lib/frameworkNewsletter";
import { SOURCES } from "@/lib/sources";

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
    const { html } = renderFwNewsletter(
      FRAMEWORKS.slice(0, 3),
      SOURCES.slice(0, 4),
      `${base}/api/unsubscribe?token=preview`,
      base,
    );
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  try {
    const report = await runFwNewsletter({
      dryRun: url.searchParams.get("dry") === "1",
      onlyTo: url.searchParams.get("to") ?? undefined,
    });
    return Response.json(report);
  } catch (e) {
    console.error("framework newsletter failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
