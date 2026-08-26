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
