// LinkedIn verbinden: leitet (mit signiertem Link aus der Freigabe-Mail oder
// ?secret=<CRON_SECRET>) zur LinkedIn-Anmeldung weiter.
import { verifySignedToken } from "@/lib/email";
import { htmlPage } from "@/lib/confirmPage";
import { authorizeUrl } from "@/lib/linkedinPost";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ok = verifySignedToken(sp.get("token") ?? "", "li-auth")
    || (process.env.CRON_SECRET && sp.get("secret") === process.env.CRON_SECRET);
  if (!ok) return htmlPage("Link ungültig oder abgelaufen", "", 400);
  return Response.redirect(authorizeUrl(), 302);
}
