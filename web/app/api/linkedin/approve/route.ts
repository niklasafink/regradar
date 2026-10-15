// Freigabe des LinkedIn-Tagesposts aus der 18-Uhr-Mail. GET zeigt nur die
// Bestätigungsseite (Link-Scanner lösen nichts aus), erst der Button (POST)
// speichert die Freigabe. Nach 08:00 am Posttag wird sofort gepostet.
import { after } from "next/server";
import { confirmPage, formBody, htmlPage } from "@/lib/confirmPage";
import { verifySignedToken } from "@/lib/email";
import { digestFor } from "@/lib/linkedin";
import { approve, berlin, postStatus, runPublish } from "@/lib/linkedinPost";

export const maxDuration = 300;

const dayOf = (req: Request) => verifySignedToken(new URL(req.url).searchParams.get("token") ?? "", "li-approve")?.day;
const invalid = () => htmlPage("Link ungültig oder abgelaufen", "<p>Der Freigabe-Link ist ungültig oder älter als 3 Tage.</p>", 400);

export async function GET(req: Request) {
  const day = dayOf(req);
  const d = day ? digestFor(day) : undefined;
  if (!day || !d) return invalid();
  const { posted } = await postStatus(day);
  if (posted) return htmlPage("Schon gepostet", `<p><a href="${posted.url}">Post auf LinkedIn ansehen →</a></p>`);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return confirmPage({
    title: "LinkedIn-Post freigeben?",
    text: `Der Post geht am ${day.split("-").reverse().join(".")} um 08:00 Uhr auf deinem Profil raus, danach der erste Kommentar mit dem Link. Nach 08:00 wird sofort gepostet.
      <a href="/api/linkedin/pdf?day=${day}" target="_blank">Slideshow als PDF</a>
      <span style="display:block;white-space:pre-wrap;margin-top:16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a">${esc(d.text)}</span>`,
    action: `/api/linkedin/approve?token=${encodeURIComponent(new URL(req.url).searchParams.get("token") ?? "")}`,
    button: "Ja, freigeben",
    fields: { confirm: "1" },
  });
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
