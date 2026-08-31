import { sendUnsubscribeNotification, verifyUnsubToken } from "@/lib/email";
import { removeSubscriber } from "@/lib/subscribers";

// Nach erfolgreicher Abmeldung (nur wenn wirklich ein Eintrag gelöscht wurde,
// nicht bei wiederholten Klicks) den Betreiber informieren — die Mail enthält
// die Erinnerung, das DataFast-Profil manuell zu löschen. Fehler beim
// Mailversand dürfen die Abmeldung selbst nie scheitern lassen.
async function notify(email: string) {
  try {
    await sendUnsubscribeNotification(email);
  } catch (err) {
    console.error("unsubscribe notification failed", err);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const email = verifyUnsubToken(token);
  const base = process.env.APP_URL ?? url.origin;

  if (!email) {
    return Response.redirect(`${base}/?abo=invalid`, 302);
  }
  const removed = await removeSubscriber(email);
  if (removed) await notify(email);
  return Response.redirect(`${base}/?abo=off`, 302);
}

// One-Click-Unsubscribe (RFC 8058): Mail-Clients wie Gmail/Outlook rufen die
// List-Unsubscribe-URL per POST ohne Nutzerinteraktion auf — keine Redirects.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = verifyUnsubToken(url.searchParams.get("token") ?? "");
  if (!email) {
    return new Response("invalid token", { status: 400 });
  }
  const removed = await removeSubscriber(email);
  if (removed) await notify(email);
  return new Response("unsubscribed", { status: 200 });
}
