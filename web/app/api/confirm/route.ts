import { verifyToken } from "@/lib/email";
import { addSubscriber } from "@/lib/subscribers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const data = verifyToken(token);
  const base = process.env.APP_URL ?? url.origin;

  if (!data) {
    return Response.redirect(`${base}/?abo=invalid`, 302);
  }
  await addSubscriber(data.email, data.provider);
  const target = data.provider ? `/r/${data.provider}` : "/";
  return Response.redirect(`${base}${target}?abo=ok`, 302);
}
