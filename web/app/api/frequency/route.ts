// Rhythmus-Umschalter aus dem Mail-Footer. GET zeigt nur eine Bestätigungs-
// seite (Link-Scanner dürfen nichts umstellen), POST mit confirm=1 stellt den
// Update-Newsletter der Adresse auf täglich bzw. wöchentlich um und leitet
// auf die Startseite mit Bestätigungstext (?abo=daily|weekly).
import { verifyFreqToken } from "@/lib/email";
import { setFrequency } from "@/lib/subscribers";
import { confirmPage, formBody } from "@/lib/confirmPage";

const LABEL = {
  daily: "einmal pro Tag, nur bei neuen Meldungen",
  weekly: "einmal pro Woche, nur bei neuen Meldungen",
} as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL ?? url.origin;
  const token = url.searchParams.get("token") ?? "";
  const data = verifyFreqToken(token);
  if (!data) return Response.redirect(`${base}/?abo=invalid`, 302);
  return confirmPage({
    title: data.freq === "weekly" ? "Auf wöchentlich umstellen?" : "Auf täglich umstellen?",
    text: `<strong>${data.email}</strong> erhält Update-Benachrichtigungen dann ${LABEL[data.freq]}. Bitte bestätigen Sie das mit einem Klick.`,
    action: `/api/frequency?token=${encodeURIComponent(token)}`,
    button: data.freq === "weekly" ? "Ja, wöchentlich" : "Ja, täglich",
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
  const ok = await setFrequency(data.email, data.freq);
  // Adresse inzwischen abgemeldet: Link ist damit wirkungslos.
  if (!ok) return Response.redirect(`${base}/?abo=invalid`, 303);
  return Response.redirect(`${base}/?abo=${data.freq}`, 303);
}
