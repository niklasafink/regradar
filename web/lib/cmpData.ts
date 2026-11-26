// Gemeinsame Typen und Hilfen für den Fassungsvergleich (Ansicht und Word-Export).
import type { CmpRow } from "./base";

export type Seg = [0 | 1 | 2, string];            // 0 gleich, 1 gelöscht, 2 ergänzt
export interface Abs { l: string; st: "eq" | "chg" | "del"; to?: string; segs: Seg[] }
export interface OldPara {
  n: string; t: string; hv: boolean; st: "same" | "changed" | "removed"; to: string[];
  abs: Abs[]; ins: { l: string; to: string; segs: Seg[] }[]; c: CmpRow[];
}
export interface NewPara { n: string; t: string; c: CmpRow[] }
export interface CmpData { old: OldPara[]; neu: NewPara[]; rest: CmpRow[] }
export type L = "de" | "en";

export const T = (de: string, en: string, lang: L) => (lang === "de" ? de : en);
export const toLabel = (to: string[]) => (to.length ? `§ ${to.join(", ")} GwBG-E` : "");

/** Kleine Zeile statt Block: wegfallend, übernommen oder so stark neu gefasst, dass kein
    sinnvoller Fließtext-Vergleich bleibt (und kein Hinweis existiert). */
export const isDot = (p: OldPara) => p.st === "removed" || p.st === "same" || (p.hv && p.c.length === 0);

/** Zielangabe für Kopfzeile und Word-Kommentar. */
export function targetText(p: OldPara, lang: L): string {
  if (p.to.length) return `${T("jetzt", "now", lang)} ${toLabel(p.to)}`;
  return T("künftig in der EU-Geldwäscheverordnung", "in future in the EU AML Regulation", lang);
}

/** Lange unveränderte Läufe auf Anfang und Ende kürzen (nur Änderungen zeigen). */
export function changesOnly(segs: Seg[], keep = 7): Seg[] {
  const out: Seg[] = [];
  segs.forEach(([k, x], i) => {
    if (k !== 0) {
      const w = x.split(/(\s+)/);
      const n = w.filter((v) => v.trim()).length;
      if (n <= 45) { out.push([k, x]); return; }
      // lange Streichungen/Ergänzungen: Anfang zeigen, Rest als Zähler
      out.push([k, `${w.slice(0, 40).join("")} […] `], [0, `(${n - 20} ${k === 1 ? "Wörter gestrichen" : "Wörter ergänzt"}) `]);
      out.push([k, w.slice(-20).join("")]);
      return;
    }
    const w = x.split(/(\s+)/);
    const n = w.filter((v) => v.trim()).length;
    if (n <= keep * 2 + 2) { out.push([0, x]); return; }
    const first = i === 0, last = i === segs.length - 1;
    const head = first ? "" : w.slice(0, keep * 2).join("");
    const tail = last ? "" : w.slice(-keep * 2).join("");
    out.push([0, `${head}${first ? "" : " "}[…]${last ? "" : " "}${tail}`.replace(/\s+\[…\]$/, " […]")]);
  });
  return out;
}

const firstSentence = (t: string) => (t.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t);

/** Kurze Kommentare für rechts bzw. Word: je Zeile Fundstelle + ein Satz. Ohne Handlungsbedarf
    und ohne hohe Wichtigkeit entfällt der Eintrag. Behörden-Zeilen entfallen. */
export function shortComments(rows: CmpRow[], lang: L): { ref: string; text: string; high: boolean }[] {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...rows]
    .filter((r) => r.aud !== "auth" && (r.act || r.imp !== "low"))
    .sort((a, b) => order[a.imp] - order[b.imp])
    .map((r) => ({
      ref: r.newRef ?? "",
      text: (r.act ? r.act[lang] ?? r.act.de : firstSentence(r.s[lang] ?? r.s.de)),
      high: r.imp === "high",
    }));
}

/** Zielhinweis für ganz wegfallende Paragrafen: „künftig in EU-Geldwäscheverordnung, Art. 10“. */
export function removedTarget(p: OldPara, lang: L): string {
  if (p.to.length) return `${T("jetzt", "now", lang)} ${toLabel(p.to)}`;
  const arts = [...new Set(p.c.map((r) => r.newRef).filter((x): x is string => !!x && /^Art\./.test(x)).map((x) => x.replace(/ VO \(EU\) 2024\/1624/, "")))];
  const base = T("fällt künftig in die EU-Geldwäscheverordnung", "moves to the EU AML Regulation", lang);
  return arts.length ? `${base}, ${arts.join(", ")}` : base;
}
