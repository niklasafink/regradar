// Rhythmus-Umschalter aus dem Mail-Footer: GET /api/frequency?token=<FreqToken>
// stellt den Update-Newsletter der Adresse auf täglich bzw. wöchentlich um und
// leitet auf die Startseite mit Bestätigungstext (?abo=daily|weekly).
import { verifyFreqToken } from "@/lib/email";
import { setFrequency } from "@/lib/subscribers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_URL ?? url.origin;
  const data = verifyFreqToken(url.searchParams.get("token") ?? "");
  if (!data) return Response.redirect(`${base}/?abo=invalid`, 302);
  const ok = await setFrequency(data.email, data.freq);
  // Adresse inzwischen abgemeldet: Link ist damit wirkungslos.
  if (!ok) return Response.redirect(`${base}/?abo=invalid`, 302);
  return Response.redirect(`${base}/?abo=${data.freq}`, 302);
}
