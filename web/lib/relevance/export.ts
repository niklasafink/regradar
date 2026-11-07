import { TOPICS } from "../base";
import { dt, FRAMEWORKS } from "../logic";
import { STATUS_LABEL, type MatchResult } from "./match";
import type { Profile } from "./profile";
import type { Framework } from "../data";
import { UPDATE_PAGES, type UpdatePage } from "../updates";
import { buildXlsx, S, type Cell, type Sheet } from "../xlsx";

/* Excel-Export der Einschlägigkeit eines Profils (/api/relevance/export), gegliedert nach
   Themengebiet → Rahmenwerk → Updates. Nutzt nur gespeicherte Ergebnisse,
   Regeln und den Cache (keine KI-Kosten); nie Geprüftes steht als
   „Noch nicht geprüft“ in der Liste. */

const NOT_CHECKED = "Noch nicht geprüft";
type Col = "ja" | "teilweise" | "nein" | "unsicher" | "offen";
const colOf = (r?: MatchResult): Col => (!r || r.stufe === "fallback" ? "offen" : r.status);
const labelOf = (r?: MatchResult) => (colOf(r) === "offen" ? NOT_CHECKED : STATUS_LABEL[r!.status]);
const reasonOf = (r?: MatchResult) => {
  if (colOf(r) === "offen") return "";
  const parts = [r!.grund, r!.teile ? `Gilt teilweise: ${r!.teile}` : "", r!.frage ? `Offene Frage: ${r!.frage.frage}` : ""];
  return parts.filter(Boolean).join("\n");
};
/** Reihenfolge im Blatt: Einschlägiges zuerst. */
const RANK: Record<Col, number> = { ja: 0, teilweise: 1, unsicher: 2, offen: 3, nein: 4 };
/** Blattnamen dürfen höchstens 31 Zeichen haben. */
const SHEET_NAME: Record<string, string> = { MKT: "Wertpapiere & Anlegerschutz" };
const today = () => new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const date = (d?: string) => (d && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(d) ? dt(d) : null);

export function relevanceWorkbook(p: Profile, results: Record<string, MatchResult>): Uint8Array {
  const base = (process.env.APP_URL ?? "https://www.regradar.de").replace(/\/$/, "");
  const updatesByFw = new Map<string, UpdatePage[]>();
  for (const page of UPDATE_PAGES) {
    const list = updatesByFw.get(page.fw.id) ?? [];
    list.push(page);
    updatesByFw.set(page.fw.id, list);
  }
  for (const list of updatesByFw.values()) list.sort((a, b) => dt(b.u.d).getTime() - dt(a.u.d).getTime());

  const head = ["Rahmenwerk", "Rechtsakt", "Ebene", "Datum", "Meldung", "Art", "Einschlägigkeit", "Begründung", "Frist", "Gilt ab", "Quelle", "Regulatory Radar"];
  const widths = [30, 22, 12, 12, 60, 18, 20, 60, 12, 12, 12, 16];
  type Count = Record<Col, number>;
  const zero = (): Count => ({ ja: 0, teilweise: 0, nein: 0, unsicher: 0, offen: 0 });
  const summary: { name: string; fws: Count; ups: Count }[] = [];
  const topicSheets: Sheet[] = [];

  for (const topic of TOPICS) {
    const fws = FRAMEWORKS.filter((f) => f.topic === topic.id);
    if (!fws.length) continue;
    const ids = new Set(fws.map((f) => f.id));
    const fwRes = (f: Framework) => results[`f:${f.id}`];
    const byRank = (a: Framework, b: Framework) =>
      RANK[colOf(fwRes(a))] - RANK[colOf(fwRes(b))] || a.n.de.localeCompare(b.n.de, "de");
    // Hauptrahmenwerke, jeweils gefolgt von ihren Kind-Rahmenwerken.
    const roots = fws.filter((f) => !f.parent || !ids.has(f.parent)).sort(byRank);
    const ordered = roots.flatMap((r) => [r, ...fws.filter((c) => c.parent === r.id).sort(byRank)]);

    const count = { name: topic.n.de, fws: zero(), ups: zero() };
    const rows: Cell[][] = [
      [{ v: topic.n.de, s: S.title }],
      [{ v: `${p.name} · Stand ${today()}`, s: S.muted }],
      [],
      head.map((h) => ({ v: h, s: S.header })),
    ];
    for (const f of ordered) {
      const fr = fwRes(f);
      count.fws[colOf(fr)]++;
      const parent = f.parent ? FRAMEWORKS.find((x) => x.id === f.parent) : undefined;
      const fwName = parent ? `${parent.n.de} › ${f.n.de}` : f.n.de;
      rows.push([
        { v: fwName, s: S.group }, { v: f.ref, s: S.group }, { v: "Rahmenwerk", s: S.group }, { date: null, s: S.groupDate },
        { v: f.about.de, s: S.group }, { v: `Rechtsraum ${f.jur}`, s: S.group }, { v: labelOf(fr), s: S.group }, { v: reasonOf(fr), s: S.group },
        { v: "", s: S.group }, { v: "", s: S.group },
        f.refUrl ? { link: f.refUrl, text: "Rechtsakt" } : { v: "", s: S.group },
        { v: "", s: S.group },
      ]);
      for (const page of updatesByFw.get(f.id) ?? []) {
        const r = results[`u:${page.slug}`];
        count.ups[colOf(r)]++;
        const u = page.u;
        rows.push([
          fwName, f.ref, "Update", { date: date(u.d) }, { v: u.ti.de, s: S.wrap }, u.t.de, labelOf(r), { v: reasonOf(r), s: S.wrap },
          { date: date(u.deadline) }, { date: date(u.eff) },
          u.url ? { link: u.url, text: "Quelle" } : "",
          { link: `${base}/u/${page.slug}`, text: "Ansehen" },
        ]);
      }
    }
    summary.push(count);
    topicSheets.push({ name: SHEET_NAME[topic.id] ?? topic.n.de, rows, widths, headerRow: 4 });
  }

  const sum = (pick: (c: (typeof summary)[number]) => Count) =>
    summary.reduce((acc, c) => { for (const k of Object.keys(acc) as Col[]) acc[k] += pick(c)[k]; return acc; }, zero());
  const line = (name: string, fws: Count, ups: Count, s?: number): Cell[] => {
    const n = (c: Count) => c.ja + c.teilweise + c.nein + c.unsicher + c.offen;
    return [name, n(fws), fws.ja + fws.teilweise, n(ups), ups.ja, ups.teilweise, ups.nein, ups.unsicher, ups.offen]
      .map((v) => (s ? { v, s } : v));
  };
  const facts = [p.gattung.join(", "), p.ecb ? (p.ecb.si ? "Direkte EZB-Aufsicht (SI)" : p.ecb.hi ? "High-Impact-LSI" : "LSI") : ""]
    .filter(Boolean).join(" · ");
  const overview: Sheet = {
    name: "Übersicht",
    widths: [34, 14, 16, 12, 14, 12, 18, 10, 20],
    headerRow: 6,
    rows: [
      [{ v: `Einschlägigkeit: ${p.name}`, s: S.title }],
      [{ v: facts || "Institutsprofil", s: S.muted }],
      [{ v: `Stand ${today()} · Regulatory Radar (regradar.de)`, s: S.muted }],
      [],
      [{ v: "Je Themengebiet ein eigenes Blatt: Rahmenwerk (grau hinterlegt), darunter seine Updates, neueste zuerst.", s: S.muted }],
      ["Themengebiet", "Rahmenwerke", "davon einschlägig", "Updates", "Einschlägig", "Teilweise", "Nicht einschlägig", "Unklar", NOT_CHECKED]
        .map((v) => ({ v, s: S.header })),
      ...summary.map((c) => line(c.name, c.fws, c.ups)),
      line("Gesamt", sum((c) => c.fws), sum((c) => c.ups), S.group),
      [],
      [{ v: "Hinweis: Die Einschätzung beruht auf den Angaben im Institutsprofil und ersetzt keine rechtliche Prüfung. „Noch nicht geprüft“ heißt, dass für dieses Profil noch kein Ergebnis vorliegt; die Prüfung läuft für Kontoprofile schrittweise im Hintergrund.", s: S.muted }],
    ],
  };

  return buildXlsx([overview, ...topicSheets], { title: `Einschlägigkeit ${p.name}` });
}
