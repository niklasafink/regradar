// Rhythmus-Links aus älteren Mails. Seit 14.10.2026 gibt es nur noch den
// wöchentlichen Versand (donnerstags): GET zeigt nur eine Bestätigungsseite
// (Link-Scanner dürfen nichts umstellen), POST mit confirm=1 setzt das Abo
// auf wöchentlich — auch bei einem alten "täglich"-Link.
import { verifyFreqToken } from "@/lib/email";
import { setWeekly } from "@/lib/subscribers";
import { confirmPage, formBody } from "@/lib/confirmPage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL ?? url.origin;
  const token = url.searchParams.get("token") ?? "";
  const data = verifyFreqToken(token);
  if (!data) return Response.redirect(`${base}/?abo=invalid`, 302);
  return confirmPage({
    title: "Updates donnerstags gesammelt",
    text: `Den täglichen Versand bieten wir nicht mehr an. <strong>${data.email}</strong> erhält Update-Benachrichtigungen donnerstags gesammelt, nur bei neuen Meldungen. Bitte bestätigen Sie das mit einem Klick.`,
    action: `/api/frequency?token=${encodeURIComponent(token)}`,
    button: "Ja, wöchentlich",
    fields: { confirm: "1" },
    cancelHref: base,
    cancelLabel: "Abbrechen",
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL ?? url.origin;
  const data = verifyFreqToken(url.searchParams.get("token") ?? "");
  if (!data) return Response.redirect(`${base}/?abo=invalid`, 303);
  const body = await formBody(request);
  if (body.get("confirm") !== "1") return new Response("confirm required", { status: 400 });
  // Adresse inzwischen abgemeldet: Link ist damit wirkungslos.
  if (!(await setWeekly(data.email))) return Response.redirect(`${base}/?abo=invalid`, 303);
  return Response.redirect(`${base}/?abo=weekly`, 303);
}
