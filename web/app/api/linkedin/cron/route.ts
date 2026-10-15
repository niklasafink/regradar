// Zeitsteuerung des LinkedIn-Tagesposts (Vercel Cron, Zeiten in UTC):
//   ?job=ask      18:00 Berlin: Freigabe-Mail für den Post am nächsten Morgen
//   ?job=publish  08:00 Berlin: freigegebenen Post veröffentlichen
// Je Job laufen zwei Crons (Sommer- und Winterzeit); nur der zur Berliner
// Stunde passende arbeitet, ?force=1 überspringt die Stundenprüfung.
// Auth wie alle Crons: Authorization: Bearer <CRON_SECRET> oder ?secret=.
import { berlin, runAsk, runPublish } from "@/lib/linkedinPost";

export const maxDuration = 300;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET fehlt" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}` && sp.get("secret") !== secret)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const job = sp.get("job");
  const force = sp.get("force") === "1";
  const { hour } = berlin();
  try {
    if (job === "ask") {
      if (!force && hour !== 18) return Response.json({ skipped: `Berlin ${hour} Uhr` });
      return Response.json({ result: await runAsk(new Date(), force) });
    }
    if (job === "publish") {
      if (!force && hour !== 8) return Response.json({ skipped: `Berlin ${hour} Uhr` });
      return Response.json({ result: await runPublish(sp.get("day") ?? undefined) });
    }
    return Response.json({ error: "job=ask|publish" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
