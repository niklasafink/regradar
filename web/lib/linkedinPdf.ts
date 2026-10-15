// Slideshow des LinkedIn-Tagesposts als PDF: alle Slides von /api/linkedin/slide
// in einer Datei, je Seite 1080×1080. Genutzt vom PDF-Link und beim Posten.
import { PDFDocument } from "pdf-lib";
import { GET as slide } from "@/app/api/linkedin/slide/route";
import type { Digest } from "./linkedin";

export async function digestPdf(d: Digest): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(d.title);
  pdf.setAuthor("regradar.de");
  for (let n = 0; n < d.slides; n++) {
    const res = await slide(new Request(`http://local/api/linkedin/slide?day=${d.day}&n=${n}`));
    if (!res.ok) throw new Error(`Slide ${n} für ${d.day}: HTTP ${res.status}`);
    const img = await pdf.embedPng(await res.arrayBuffer());
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return pdf.save();
}
