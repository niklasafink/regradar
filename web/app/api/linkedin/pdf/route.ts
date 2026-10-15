// Slideshow des täglichen LinkedIn-Posts als PDF (das Dokument, das LinkedIn
// als Karussell zeigt). GET ?day=YYYY-MM-DD. Regeln in LINKEDIN.md.
import { digestFor } from "@/lib/linkedin";
import { digestPdf } from "@/lib/linkedinPdf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const day = new URL(req.url).searchParams.get("day") ?? "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? digestFor(day) : undefined;
  if (!d) return new Response("Nicht gefunden", { status: 404 });
  return new Response(Buffer.from(await digestPdf(d)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="regradar-${day}.pdf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
