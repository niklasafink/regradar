// Freigabe des LinkedIn-Tagesposts aus der 18-Uhr-Mail. GET zeigt nur die
// Vorschau im LinkedIn-Look (lib/linkedinPreview.ts, Link-Scanner lösen
// nichts aus), erst der Button „Ja, freigeben“ (POST)
// speichert die Freigabe. Nach 08:00 am Posttag wird sofort gepostet.
import { after } from "next/server";
import { formBody, htmlPage } from "@/lib/confirmPage";
import { verifySignedToken } from "@/lib/email";
import { digestFor } from "@/lib/linkedin";
import { approve, berlin, getToken, postStatus, runPublish } from "@/lib/linkedinPost";
import { previewHtml } from "@/lib/linkedinPreview";

export const maxDuration = 300;

const dayOf = (req: Request) => verifySignedToken(new URL(req.url).searchParams.get("token") ?? "", "li-approve")?.day;
const invalid = () => htmlPage("Link ungültig oder abgelaufen", "<p>Der Freigabe-Link ist ungültig oder älter als 3 Tage.</p>", 400);

export async function GET(req: Request) {
  const day = dayOf(req);
  const d = day ? digestFor(day) : undefined;
  if (!day || !d) return invalid();
  const { posted } = await postStatus(day);
  if (posted) return htmlPage("Schon gepostet", `<p><a href="${posted.url}">Post auf LinkedIn ansehen →</a></p>`);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const html = previewHtml(d, {
    name: (await getToken().catch(() => null))?.name ?? "Niklas Fink",
    action: `/api/linkedin/approve?token=${encodeURIComponent(token)}`,
    when: `${day.split("-").reverse().join(".")} um 08:00 Uhr`,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const day = dayOf(req);
  const d = day ? digestFor(day) : undefined;
  if (!day || !d) return invalid();
  if ((await formBody(req)).get("confirm") !== "1") return htmlPage("Bestätigung fehlt", "", 400);
  await approve(d);
  const now = berlin();
  const late = now.day > day || (now.day === day && now.hour >= 8);
  if (late) after(async () => { await runPublish(day).catch((e) => console.error("linkedin publish:", e)); });
  return htmlPage("Freigegeben",
    late ? "<p>Der Post geht jetzt raus. Du bekommst eine Mail, sobald er online ist.</p>"
      : `<p>Der Post geht am ${day.split("-").reverse().join(".")} um 08:00 Uhr raus. Du bekommst eine Mail, sobald er online ist.</p>`);
}
