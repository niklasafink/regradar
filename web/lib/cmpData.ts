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
    if (k !== 0) { out.push([k, x]); return; }
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
