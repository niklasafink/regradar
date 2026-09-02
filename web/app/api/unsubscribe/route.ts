// Abmeldung. Der Link in der Mail (GET) zeigt NUR eine Bestätigungsseite —
// Sicherheits-Scanner in Firmenpostfächern rufen jeden Link automatisch auf
// und hatten so Abonnenten Sekunden nach der Zustellung abgemeldet. Erst der
// Button (POST mit confirm=1) meldet ab. Der One-Click-Weg nach RFC 8058
// (POST mit Body "List-Unsubscribe=One-Click", von Gmail/Outlook nur nach
// Nutzeraktion ausgelöst) meldet weiterhin direkt ab.
import { sendUnsubscribeConfirmation, sendUnsubscribeNotification, verifyUnsubToken } from "@/lib/email";
import { removeSubscriber } from "@/lib/subscribers";
import { confirmPage, formBody, htmlPage } from "@/lib/confirmPage";

// Nach erfolgreicher Abmeldung (nur wenn wirklich ein Eintrag gelöscht wurde,
// nicht bei wiederholten Klicks) den Betreiber informieren — die Mail enthält
// die Erinnerung, das DataFast-Profil manuell zu löschen. Fehler beim
// Mailversand dürfen die Abmeldung selbst nie scheitern lassen.
// Außerdem bekommt der Abonnent selbst eine Bestätigung mit Link zur
// erneuten Anmeldung.
async function notify(email: string) {
  const results = await Promise.allSettled([
    sendUnsubscribeConfirmation(email),
    sendUnsubscribeNotification(email),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("unsubscribe mail failed", r.reason);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const email = verifyUnsubToken(token);
  const base = process.env.APP_URL ?? url.origin;
  if (!email) return Response.redirect(`${base}/?abo=invalid`, 302);
  return confirmPage({
    title: "Newsletter abbestellen?",
    text: `Sie möchten <strong>${email}</strong> von den Update-Benachrichtigungen von Regulatory Radar abmelden. Bitte bestätigen Sie das mit einem Klick.`,
    action: `/api/unsubscribe?token=${encodeURIComponent(token)}`,
    button: "Ja, abmelden",
    fields: { confirm: "1" },
    cancelHref: base,
    cancelLabel: "Nein, abonniert bleiben",
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL ?? url.origin;
  const email = verifyUnsubToken(url.searchParams.get("token") ?? "");
  if (!email) return new Response("invalid token", { status: 400 });
  const body = await formBody(request);
  const oneClick = body.get("List-Unsubscribe") === "One-Click";
  const confirmed = body.get("confirm") === "1";
  if (!oneClick && !confirmed) {
    // Automatischer POST ohne bekannten Body (Scanner): nichts tun.
    return htmlPage("Nicht abgemeldet", `<p style="font-size:14px;color:#475569">Bitte nutzen Sie den Bestätigungs-Button auf der Abmeldeseite.</p>`, 400);
  }
  const removed = await removeSubscriber(email);
  if (removed) await notify(email);
  // One-Click (Mail-Client): keine Redirects, nur 200. Browser-Formular: Startseite.
  if (oneClick) return new Response("unsubscribed", { status: 200 });
  return Response.redirect(`${base}/?abo=off`, 303);
}
