// Herzschlag des Stundenlaufs (scraper/run_hourly.sh → python3 -m regradar heartbeat).
// Auth: "Authorization: Bearer <HEALTH_SECRET>". Speichert den Zustand und
// bewertet sofort — so kommt die Alarm-Mail spätestens mit dem nächsten Lauf,
// nachdem eine Quelle 24 h lang nicht erfolgreich war.
import { healthSecretOk, runCheck, writeState, type HeartbeatState } from "@/lib/health";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!healthSecretOk(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Omit<HeartbeatState, "receivedAt">;
  try {
    body = (await request.json()) as Omit<HeartbeatState, "receivedAt">;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body || !Array.isArray(body.sources)) {
    return Response.json({ error: "sources_missing" }, { status: 400 });
  }
  const state = await writeState(body);
  const check = await runCheck();
  return Response.json({
    ok: true,
    receivedAt: state.receivedAt,
    sources: state.sources.length,
    problems: check.problems.map((p) => p.key),
    mailed: check.mailed,
    mailError: check.mailError,
  });
}
