// Reparaturaufträge und Statusdaten für /admin/health.
//
// Statusseite (Auth: ?t=<Seiten-Token>):
//   GET  ?t=…&all=1        → Zustand, Probleme, Alarm-Zustand, Reparaturen
//   POST ?t=…  {source}    → Reparaturauftrag anlegen (idempotent)
//
// Reparatur-Agent auf dem Mac (Auth: Bearer HEALTH_SECRET):
//   GET  ?pending=1        → offene Aufträge
//   POST {source,status,steps,result} → Fortschritt melden
import {
  evaluate,
  healthSecretOk,
  listRepairs,
  pendingRepairs,
  readAlerts,
  readState,
  requestRepair,
  updateRepair,
  verifyHealthToken,
  type RepairState,
  type RepairStep,
} from "@/lib/health";

const SOURCE_RE = /^[a-z0-9_]{1,40}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("pending") === "1") {
    if (!healthSecretOk(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
    const pending = await pendingRepairs();
    const repairs = await listRepairs();
    return Response.json({ pending, repairs: Object.fromEntries(pending.map((p) => [p, repairs[p] ?? null])) });
  }
  const token = url.searchParams.get("t") ?? "";
  if (!verifyHealthToken(token)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const state = await readState();
  return Response.json(
    {
      now: new Date().toISOString(),
      state,
      problems: evaluate(state),
      alerts: await readAlerts(),
      repairs: await listRepairs(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let body: {
    source?: string;
    label?: string;
    status?: RepairState["status"];
    steps?: RepairStep[];
    result?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const source = (body.source ?? "").trim();
  if (!SOURCE_RE.test(source)) return Response.json({ error: "invalid_source" }, { status: 400 });

  // Fortschritt vom Agenten
  if (healthSecretOk(request)) {
    const status = body.status;
    if (status !== "requested" && status !== "running" && status !== "done" && status !== "failed") {
      return Response.json({ error: "invalid_status" }, { status: 400 });
    }
    const steps = Array.isArray(body.steps) ? body.steps.slice(0, 60) : [];
    const state = await updateRepair({
      source,
      label: body.label,
      status,
      steps,
      result: typeof body.result === "string" ? body.result.slice(0, 4000) : undefined,
    });
    return Response.json({ ok: true, repair: state });
  }

  // Auftrag von der Statusseite
  const token = url.searchParams.get("t") ?? "";
  if (!verifyHealthToken(token)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const state = await readState();
  const known = state?.sources.find((s) => s.id === source);
  if (source !== "pipeline" && !known) return Response.json({ error: "unknown_source" }, { status: 404 });
  const label = source === "pipeline" ? "Stundenlauf (gesamte Pipeline)" : known!.name;
  const repair = await requestRepair(source, label);
  return Response.json({ ok: true, repair });
}
