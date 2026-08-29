import { sendSubscriberNotification, verifyToken } from "@/lib/email";
import { addSubscriber } from "@/lib/subscribers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const data = verifyToken(token);
  const base = process.env.APP_URL ?? url.origin;

  if (!data) {
    return Response.redirect(`${base}/?abo=invalid`, 302);
  }
  const result = await addSubscriber(data.email, data.providers);
  // "unchanged" (wiederholter Aufruf desselben Links durch Mail-Scanner
  // oder Reload) löst keine Mail aus.
  if (result !== "unchanged") {
    try {
      await sendSubscriberNotification(
        data.email,
        data.providers,
        result === "new" ? "confirmed" : "expanded",
      );
    } catch (e) {
      // Benachrichtigung darf die Bestätigung nicht blockieren.
      console.error("subscriber notification failed:", e);
    }
  }
  const target = data.providers[0] ? `/r/${data.providers[0]}` : "/";
  return Response.redirect(`${base}${target}?abo=ok`, 302);
}
