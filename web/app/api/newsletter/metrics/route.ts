// E-Mail-Metriken aus Resend (Zustellung, Öffnungen, Klicks, Bounces …).
//   GET /api/newsletter/metrics                    → JSON, letzte 30 Tage
//   GET /api/newsletter/metrics?days=90            → Zeitraum in Tagen (1–365)
//   GET /api/newsletter/metrics?granularity=daily  → daily | weekly | monthly
//   GET /api/newsletter/metrics?html=1             → Übersicht im Browser
//
// Auth wie bei den Versand-Routen: "Authorization: Bearer <CRON_SECRET>"
// oder ?secret=<CRON_SECRET>. Resend-Key: RESEND_METRICS_API_KEY (Leserechte),
// Fallback RESEND_API_KEY.

import { fetchEmailMetrics, renderMetricsHtml, type Granularity } from "@/lib/emailMetrics";

export const dynamic = "force-dynamic";

const GRANULARITIES: Granularity[] = ["daily", "weekly", "monthly"];

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

  const days = Number.parseInt(url.searchParams.get("days") ?? "30", 10) || 30;
  const g = url.searchParams.get("granularity") as Granularity | null;
  const granularity = g && GRANULARITIES.includes(g) ? g : undefined;

  try {
    const report = await fetchEmailMetrics({ days, granularity });
    if (url.searchParams.get("html") === "1") {
      return new Response(renderMetricsHtml(report, days), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("email metrics failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
