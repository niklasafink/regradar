import { verifyUnsubToken } from "@/lib/email";
import { removeSubscriber } from "@/lib/subscribers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const email = verifyUnsubToken(token);
  const base = process.env.APP_URL ?? url.origin;

  if (!email) {
    return Response.redirect(`${base}/?abo=invalid`, 302);
  }
  await removeSubscriber(email);
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
  await removeSubscriber(email);
  return new Response("unsubscribed", { status: 200 });
}
