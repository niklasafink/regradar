// Externer Takt der Scraper-Überwachung.
//   GET /api/health/check                → Bewertung anstoßen (ohne Auth, max.
//                                          alle 4 Min.; GitHub Actions stündlich)
//   GET /api/health/check  (Bearer CRON_SECRET, Vercel-Cron täglich, oder
//        ?secret=<CRON_SECRET|HEALTH_SECRET>) → Bewertung + Details als JSON
//   GET /api/health/check?test=1 (mit Auth) → Beispiel-Alarmmail an den
//        Betreiber, ohne den Alarm-Zustand zu verändern
//
// Ohne Auth verrät die Antwort nichts über den Zustand — der offene Endpunkt
// kann nur eine ohnehin fällige Bewertung auslösen, nicht mehr Mails (Dedupe
// im Alarm-Zustand) und keine Daten.
import {
  acquireTick,
  evaluate,
  healthPageUrl,
  operatorOk,
  readAlerts,
  readState,
  runCheck,
  sendHealthMail,
} from "@/lib/health";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authed = operatorOk(request);

  if (!authed) {
    if (!(await acquireTick())) return Response.json({ ok: true, skipped: true });
    try {
      await runCheck();
    } catch (e) {
      console.error("health check failed:", e);
      return Response.json({ ok: false }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  if (url.searchParams.get("test") === "1") {
    const state = await readState();
    const problems = evaluate(state);
    const sample = problems.length
      ? problems
      : [
          {
            key: "source:bafin",
            label: "BaFin (Beispiel)",
            since: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
            detail: "Beispiel: Feed nicht erreichbar (HTTP 503)",
          },
        ];
    try {
      await sendHealthMail({ newProblems: sample, reminders: [], recovered: [], problems: sample, testMode: true });
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
    return Response.json({ ok: true, test: true, problems: sample.map((p) => p.key), page: healthPageUrl() });
  }

  try {
    const result = await runCheck();
    const state = await readState();
    return Response.json({
      ok: true,
      lastHeartbeat: state?.receivedAt ?? null,
      problems: result.problems,
      newProblems: result.newProblems.map((p) => p.key),
      reminders: result.reminders.map((p) => p.key),
      recovered: result.recovered.map((r) => r.key),
      mailed: result.mailed,
      mailError: result.mailError,
      alerts: await readAlerts(),
      page: healthPageUrl(),
    });
  } catch (e) {
    console.error("health check failed:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
