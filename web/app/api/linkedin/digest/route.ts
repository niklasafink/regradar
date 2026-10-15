// Tages-Post für LinkedIn als JSON: Text, Titel und Slide-URLs.
// GET ?day=YYYY-MM-DD (Posttag), ohne day: Liste der Posttage.
// Gepostet wird hier nichts; das übernimmt später ein eigener Cron.
import { digestDays, digestFor } from "@/lib/linkedin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const day = url.searchParams.get("day");
  if (!day) return Response.json({ days: digestDays() });
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? digestFor(day) : undefined;
  if (!d) return Response.json({ error: "Kein Post für diesen Tag" }, { status: 404 });
  return Response.json({
    day: d.day,
    window: d.window,
    title: d.title,
    text: d.text,
    comment: d.comment,
    chars: d.text.length,
    items: d.items.map((i) => ({ slug: i.page.slug, imp: i.page.u.imp, kern: i.kern })),
    slides: Array.from({ length: d.slides }, (_, n) =>
      `${url.origin}/api/linkedin/slide?day=${d.day}&n=${n}`),
  });
}
