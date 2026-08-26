// Newsletter-Versand. Aufruf durch Vercel Cron (vercel.json) oder manuell:
//   GET /api/newsletter/send                     → echter Versand
//   GET /api/newsletter/send?dry=1               → nur Report, kein Versand
//   GET /api/newsletter/send?to=mail@example.com → Testversand nur an diese
//       Adresse (markiert nichts als versandt)
//   GET /api/newsletter/send?preview=1           → HTML-Vorschau der neuesten
//       Updates im Browser, kein Versand
//
// Auth: "Authorization: Bearer <CRON_SECRET>" (setzt Vercel Cron automatisch,
// wenn die Env-Variable CRON_SECRET existiert) oder ?secret=<CRON_SECRET>.

import { renderNewsletter, runNewsletter } from "@/lib/newsletter";
import { UPDATE_PAGES } from "@/lib/updates";

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
    const html = renderNewsletter(UPDATE_PAGES.slice(0, 8), `${base}/api/unsubscribe?token=preview`, base);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  try {
    const report = await runNewsletter({
      dryRun: url.searchParams.get("dry") === "1",
      onlyTo: url.searchParams.get("to") ?? undefined,
    });
    return Response.json(report);
  } catch (e) {
    console.error("newsletter failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
