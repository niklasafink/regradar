// Schnittstelle der automatischen Newsletter-QS (scraper/newsletter_qa.py).
//   GET  → Wochen-Slot, vorhandenes QS-Ergebnis, Deploy-Commit und die
//          Meldungen, die beim nächsten Versand rausgingen (verändert nichts)
//   POST → QS-Ergebnis für den aktuellen Slot speichern und die Freigabe-Mail
//          an den Betreiber auslösen. Body: { ok, report, checked?, commit? }
//
// Auth wie /api/newsletter/send: "Authorization: Bearer <CRON_SECRET>" oder
// ?secret=<CRON_SECRET>.

import { authority, impactOf } from "@/lib/logic";
import { pendingUpdates, runNewsletter } from "@/lib/newsletter";
import { readQa, writeQa } from "@/lib/newsletterQa";
import { firstParagraph } from "@/lib/updates";

export const maxDuration = 120;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return request.headers.get("authorization") === `Bearer ${secret}`
    || url.searchParams.get("secret") === secret;
}

const commit = () => process.env.VERCEL_GIT_COMMIT_SHA ?? null;

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { slot, pages, due, subscribers } = await pendingUpdates();
  return Response.json({
    slot,
    commit: commit(),
    qa: await readQa(slot),
    due,
    subscribers,
    pending: pages.map(({ slug, fw, u }) => ({
      slug,
      date: u.d,
      title: u.ti.de,
      titleEn: u.ti.en,
      type: u.t.de,
      source: u.src,
      authority: authority(u.src),
      url: u.url ?? null,
      framework: fw.id,
      frameworkName: fw.n.de,
      parent: fw.parent ?? null,
      impact: impactOf(u),
      deadline: u.deadline ?? null,
      effective: u.eff ?? null,
      summary: firstParagraph(u.s.de),
    })),
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { ok?: unknown; report?: unknown; checked?: unknown; commit?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.report !== "string" || !body.report.trim()) {
    return Response.json({ error: "report_missing" }, { status: 400 });
  }
  const { slot } = await pendingUpdates();
  await writeQa(slot, {
    at: new Date().toISOString(),
    ok: body.ok === true,
    report: body.report.trim().slice(0, 6000),
    checked: Array.isArray(body.checked)
      ? body.checked.filter((s): s is string => typeof s === "string")
      : undefined,
    commit: typeof body.commit === "string" ? body.commit : commit() ?? undefined,
  });
  try {
    const report = await runNewsletter({ afterQa: true });
    return Response.json({ slot, report });
  } catch (e) {
    console.error("newsletter approval after QA failed:", e);
    return Response.json({ slot, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
