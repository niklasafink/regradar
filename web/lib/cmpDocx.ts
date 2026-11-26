// Word-Export des Fassungsvergleichs: Wortlaut im Änderungsmodus (echte Word-
// Revisionen, annehmen und ablehnen möglich), Umsetzungshinweise als Kommentare.
// Läuft im Browser; die Bibliothek wird erst beim Klick geladen.
import type { CmpRow, Comparison } from "./base";
import { T, targetText, toLabel, type CmpData, type L, type OldPara, type Seg } from "./cmpData";

const AUTHOR = "Regulatory Radar";

export async function exportCmpDocx(cmp: Comparison, lang: L, opts: { old: OldPara[]; neu: CmpData["neu"]; rest: CmpRow[] }) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, InsertedTextRun, DeletedTextRun,
    CommentRangeStart, CommentRangeEnd, CommentReference,
  } = await import("docx");

  const date = new Date();
  let revId = 1;
  const comments: { id: number; author: string; date: Date; children: InstanceType<typeof Paragraph>[] }[] = [];

  const commentParas = (lines: string[]) => lines.filter(Boolean).map((t) => new Paragraph({ children: [new TextRun({ text: t, size: 20 })] }));
  const rowLines = (r: CmpRow) => [
    r.newRef ? `${r.newRef}` : "",
    tx(r.s),
    r.act ? `${T("Für Institute: ", "For institutions: ", lang)}${tx(r.act)}` : "",
    `${T("Beleg", "Source", lang)}: ${r.src}`,
  ];
  const tx = (t: { de: string; en: string }) => t[lang] ?? t.de;

  /** Absatz/Überschrift mit angehängtem Word-Kommentar. */
  const withComment = (children: any[], lines: string[]) => {
    const body = lines.filter(Boolean);
    if (!body.length) return children;
    const id = comments.length;
    comments.push({ id, author: AUTHOR, date, children: commentParas(body) });
    return [new CommentRangeStart(id), ...children, new CommentRangeEnd(id), new TextRun({ children: [new CommentReference(id)] })];
  };

  const segRuns = (segs: Seg[]) =>
    segs.map(([k, x]) =>
      k === 0
        ? new TextRun({ text: x })
        : k === 1
          ? new DeletedTextRun({ text: x, id: revId++, author: AUTHOR, date: date.toISOString() })
          : new InsertedTextRun({ text: x, id: revId++, author: AUTHOR, date: date.toISOString() }),
    );

  const heading = (text: string, lines: string[]) =>
    new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240 }, children: withComment([new TextRun({ text, bold: true })], lines) });

  const out: any[] = [];
  out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(`${T("Fassungsvergleich", "Version comparison", lang)}: ${tx(cmp.from.n)} ${T("gegen", "against", lang)} ${tx(cmp.to.n)}`)] }));
  out.push(new Paragraph({ children: [new TextRun({ text: `${tx(cmp.to.note)} ${T("Quelle", "Source", lang)}: ${cmp.to.url}`, size: 20 })] }));
  out.push(new Paragraph({ children: [new TextRun({ text: T("Änderungen als Word-Revisionen (Autor: Regulatory Radar), Umsetzungshinweise als Kommentare. Redaktionelle Auswertung, keine Rechtsberatung.", "Changes as Word tracked changes (author: Regulatory Radar), implementation notes as comments. Editorial analysis, no legal advice.", lang), italics: true, size: 18 })] }));

  for (const p of opts.old) {
    const head = `§ ${p.n} GwG ${p.t}`;
    const lines: string[] = [targetText(p, lang)];
    if (p.st === "removed" && !p.to.length) lines[0] = T("Künftig in der EU-Geldwäscheverordnung (VO (EU) 2024/1624) geregelt, im nationalen Gesetz gestrichen.", "In future governed by the EU AML Regulation (Regulation (EU) 2024/1624), deleted from the national act.", lang);
    if (p.st === "same") lines[0] = `${T("Inhaltlich übernommen", "Carried over", lang)}: ${toLabel(p.to)}`;
    for (const r of [...p.c].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.imp] - { high: 0, medium: 1, low: 2 }[b.imp]))) lines.push("", ...rowLines(r));
    out.push(heading(head, lines));
    const items = [...p.abs.map((a) => ({ l: a.l, segs: a.segs })), ...p.ins.map((a) => ({ l: a.l, segs: a.segs }))];
    if (p.st === "same") { out.push(new Paragraph({ children: [new TextRun({ text: T("Unverändert übernommen.", "Carried over unchanged.", lang), italics: true })] })); continue; }
    for (const a of items) {
      out.push(new Paragraph({ spacing: { after: 100 }, children: [...(a.l ? [new TextRun({ text: `${a.l} `, bold: true })] : []), ...segRuns(a.segs)] }));
    }
  }

  if (opts.neu.length) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 }, children: [new TextRun(T("Neu im GwBG-E, ohne Vorgänger im GwG", "New in the GwBG-E, no predecessor in the GwG", lang))] }));
    for (const n of opts.neu) {
      const lines = n.c.flatMap((r) => ["", ...rowLines(r)]);
      out.push(new Paragraph({ spacing: { after: 60 }, children: withComment([new InsertedTextRun({ text: `§ ${n.n} GwBG-E ${n.t}`, id: revId++, author: AUTHOR, date: date.toISOString() })], lines.length ? lines : [T("Neue Vorschrift ohne Vorgänger im GwG.", "New provision without predecessor in the GwG.", lang)]) }));
    }
  }
  if (opts.rest.length) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 }, children: [new TextRun(T("Weitere Änderungen, Fristen und Folgeänderungen", "Further changes, deadlines and consequential amendments", lang))] }));
    for (const r of opts.rest) {
      out.push(heading(`${r.oldRef ?? T("keine Entsprechung", "no counterpart", lang)} → ${r.newRef ?? T("entfällt", "removed", lang)}`, rowLines({ ...r, newRef: undefined })));
    }
  }

  const doc = new Document({
    creator: AUTHOR,
    title: `${T("Fassungsvergleich", "Version comparison", lang)} GwG GwBG-E`,
    comments: { children: comments },
    features: { trackRevisions: true },
    sections: [{ children: out }],
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Fassungsvergleich-GwG-GwBG-E.docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
