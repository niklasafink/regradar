// Einmalige Ankündigungsmail, Ablauf siehe lib/announce.ts.
// Auth: "Authorization: Bearer <CRON_SECRET>" (Vercel Cron) oder ?secret=<CRON_SECRET>.

import { announceStatus, runAnnounce, sendAnnounceTest, setAnnounceApproved } from "@/lib/announce";

export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET fehlt" }, { status: 500 });
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}` && url.searchParams.get("secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const base = process.env.APP_URL ?? url.origin;
  const p = url.searchParams;
  try {
    if (p.get("status") === "1") return Response.json(await announceStatus());
    const approve = p.get("approve");
    if (approve !== null) {
      await setAnnounceApproved(approve === "1");
      return Response.json(await announceStatus());
    }
    const to = p.get("to");
    if (to) return Response.json(await sendAnnounceTest(base, to));
    return Response.json(await runAnnounce(base, { dryRun: p.get("dry") === "1" }));
  } catch (e) {
    console.error("announce failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
