// OAuth-Rückweg von LinkedIn: Code gegen Token tauschen und in Redis speichern.
import { htmlPage } from "@/lib/confirmPage";
import { verifySignedToken } from "@/lib/email";
import { connect } from "@/lib/linkedinPost";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (!verifySignedToken(sp.get("state") ?? "", "li-oauth"))
    return htmlPage("Anmeldung abgelaufen", "<p>Bitte den Verbinden-Link erneut öffnen.</p>", 400);
  const code = sp.get("code");
  if (!code) return htmlPage("LinkedIn hat abgelehnt", `<p>${(sp.get("error_description") ?? "").replace(/</g, "&lt;")}</p>`, 400);
  try {
    const t = await connect(code);
    const until = new Date(t.exp).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    return htmlPage("LinkedIn verbunden", `<p>Verbunden als ${(t.name ?? t.sub).replace(/</g, "&lt;")}. Gültig bis ${until}.</p>`);
  } catch (e) {
    return htmlPage("Verbindung fehlgeschlagen", `<p>${String(e instanceof Error ? e.message : e).replace(/</g, "&lt;")}</p>`, 500);
  }
}
