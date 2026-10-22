// Maschinen-Schnittstelle der Radar-Entscheidungspunkte (gapreport.py und
// radar_actions.py aus dem Stundenlauf). Auth wie /api/newsletter/qa:
// "Authorization: Bearer <CRON_SECRET>" oder ?secret=<CRON_SECRET>.
//
//   GET  ?status=analysis_requested,approved → passende Punkte
//   POST { action:"upsert", items:[…] }      → legt Punkte an, antwortet mit
//                                              links: { <id>: <Entscheidungs-URL> }
//   POST { action:"analysis", id, proposal, code, links? } → Analyse speichern
//   POST { action:"result", id, ok, report } → Ausführungsbericht speichern

import {
  RADAR_CODES,
  listItems,
  radarToken,
  readItem,
  upsertItems,
  writeItem,
  type RadarItem,
  type RadarKind,
  type RadarLink,
  type RadarStatus,
} from "@/lib/radar";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return request.headers.get("authorization") === `Bearer ${secret}`
    || url.searchParams.get("secret") === secret;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function links(v: unknown): RadarLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((l) => ({ label: str((l as RadarLink)?.label, 200), url: str((l as RadarLink)?.url, 600) }))
    .filter((l) => /^https?:\/\//.test(l.url))
    .slice(0, 12);
}

function parseItem(raw: Record<string, unknown>): RadarItem | null {
  const kind = raw.kind as RadarKind;
  const id = str(raw.id, 80);
  if (!id || !(kind in RADAR_CODES)) return null;
  const rec = raw.recommendation as { code?: unknown; reason?: unknown } | undefined;
  const code = str(rec?.code, 40);
  return {
    id,
    kind,
    nr: Number(raw.nr) || 0,
    createdAt: new Date().toISOString(),
    title: str(raw.title, 200) || id,
    detail: str(raw.detail, 1500) || undefined,
    links: links(raw.links),
    codes: RADAR_CODES[kind],
    recommendation: RADAR_CODES[kind].includes(code) ? { code, reason: str(rec?.reason, 400) } : undefined,
    meta: typeof raw.meta === "object" && raw.meta ? (raw.meta as Record<string, unknown>) : undefined,
    status: "open",
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const wanted = new URL(request.url).searchParams.get("status");
  const statuses = wanted ? (wanted.split(",") as RadarStatus[]) : undefined;
  return Response.json({ items: await listItems(statuses) });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.action === "upsert") {
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((r) => parseItem(r as Record<string, unknown>))
      .filter((i): i is RadarItem => i !== null);
    await upsertItems(items);
    const origin = new URL(request.url).origin;
    return Response.json({
      links: Object.fromEntries(
        items.map((i) => [i.id, `${origin}/api/radar/item?token=${encodeURIComponent(radarToken(i.id))}`]),
      ),
    });
  }

  const item = await readItem(str(body.id, 80));
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });
  const at = new Date().toISOString();

  if (body.action === "analysis") {
    const code = str(body.code, 40);
    await writeItem({
      ...item,
      status: "analyzed",
      analysis: {
        at,
        proposal: str(body.proposal, 6000),
        code: item.codes.includes(code) ? code : (item.recommendation?.code ?? item.codes[0]),
        links: links(body.links),
      },
    });
    return Response.json({ ok: true });
  }
  if (body.action === "result") {
    await writeItem({
      ...item,
      status: body.ok === true ? "done" : "failed",
      result: { at, ok: body.ok === true, report: str(body.report, 6000) },
    });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown_action" }, { status: 400 });
}
