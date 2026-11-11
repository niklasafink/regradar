import { PRAXIS_CAT_LABELS, TOPICS } from "../base";
import { daysUntil, dt, FRAMEWORKS } from "../logic";
import { PRAXIS } from "../live";
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
export type Col = "ja" | "teilweise" | "nein" | "unsicher" | "offen";
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

/** `only`: nur diese Status exportieren (Filter auf „Alle Updates“). Ohne
    Filter alles, auch noch nicht Geprüftes. Rahmenwerk-Zeilen bleiben als
    Gliederung stehen, wenn mindestens ein Update darunter passt. */
export interface ExportScope {
  /** Welche Arten: Updates (Standard), nur Aufsichtspraxis oder beides */
  art?: "updates" | "praxis" | "alle";
  /** Nur Updates mit künftigem Anwendungsbeginn oder künftiger Frist */
  future?: boolean;
  /** Nur Rahmenwerke dieses Institutstyps (Provider-ID wie auf „Alle Updates“) */
  inst?: string;
}

/** Nächster anstehender Termin eines Updates (Anwendungsbeginn oder Frist). */
function upcoming(u: UpdatePage["u"]): { date: string; kind: string } | null {
  const c: { date: string; kind: string }[] = [];
  if (u.eff && daysUntil(u.eff) >= 0) c.push({ date: u.eff, kind: "Gilt ab" });
  if (u.deadline && daysUntil(u.deadline) >= 0) c.push({ date: u.deadline, kind: "Frist" });
  c.sort((a, b) => dt(a.date).getTime() - dt(b.date).getTime());
  return c[0] ?? null;
}

export function relevanceWorkbook(p: Profile, results: Record<string, MatchResult>, only?: Set<Col>, scope: ExportScope = {}): Uint8Array {
  const art = scope.art ?? "updates";
  const wantUpdates = art !== "praxis";
  const wantPraxis = art !== "updates" && !scope.future;
  const scoped = !!(scope.future || scope.inst);
  const inScope = (page: UpdatePage) =>
    (!scope.inst || page.fw.ents.includes(scope.inst)) && (!scope.future || !!upcoming(page.u));
  const keep = (r?: MatchResult) => !only || only.has(colOf(r));
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
      const pages = updatesByFw.get(f.id) ?? [];
      for (const page of pages) count.ups[colOf(results[`u:${page.slug}`])]++;
      const shownPages = pages.filter((page) => inScope(page) && keep(results[`u:${page.slug}`]));
      if (scoped ? !shownPages.length : !keep(fr) && !shownPages.length) continue;
      const parent = f.parent ? FRAMEWORKS.find((x) => x.id === f.parent) : undefined;
      const fwName = parent ? `${parent.n.de} › ${f.n.de}` : f.n.de;
      rows.push([
        { v: fwName, s: S.group }, { v: f.ref, s: S.group }, { v: "Rahmenwerk", s: S.group }, { date: null, s: S.groupDate },
        { v: f.about.de, s: S.group }, { v: `Rechtsraum ${f.jur}`, s: S.group }, { v: labelOf(fr), s: S.group }, { v: reasonOf(fr), s: S.group },
        { v: "", s: S.group }, { v: "", s: S.group },
        f.refUrl ? { link: f.refUrl, text: "Rechtsakt" } : { v: "", s: S.group },
        { v: "", s: S.group },
      ]);
      for (const page of shownPages) {
        const r = results[`u:${page.slug}`];
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
    if (rows.length > 4) topicSheets.push({ name: SHEET_NAME[topic.id] ?? topic.n.de, rows, widths, headerRow: 4 });
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
      [{ v: only
        ? `Exportiert: ${[...only].map((c) => (c === "offen" ? NOT_CHECKED : STATUS_LABEL[c])).join(", ")}. Die Übersicht zählt alle Einträge.`
        : scope.future && wantUpdates
          ? "Ein Blatt „Zukünftige Normen“, nach Termin aufsteigend (Anwendungsbeginn oder Frist)."
          : !wantUpdates
            ? "Ein Blatt „Aufsichtspraxis“, neueste zuerst. Die Zählung unten bezieht sich auf die Updates."
            : "Je Themengebiet ein eigenes Blatt: Rahmenwerk (grau hinterlegt), darunter seine Updates, neueste zuerst.", s: S.muted }],
      ["Themengebiet", "Rahmenwerke", "davon einschlägig", "Updates", "Einschlägig", "Teilweise", "Nicht einschlägig", "Unklar", NOT_CHECKED]
        .map((v) => ({ v, s: S.header })),
      ...summary.map((c) => line(c.name, c.fws, c.ups)),
      line("Gesamt", sum((c) => c.fws), sum((c) => c.ups), S.group),
      [],
      [{ v: "Hinweis: Die Einschätzung beruht auf den Angaben im Institutsprofil und ersetzt keine rechtliche Prüfung. „Noch nicht geprüft“ heißt, dass für dieses Profil noch kein Ergebnis vorliegt; die Prüfung läuft für Kontoprofile schrittweise im Hintergrund.", s: S.muted }],
    ],
  };

  // Zukünftige Normen: eine flache Liste nach Termin, statt Gliederung nach Themengebiet
  const sheets: Sheet[] = [];
  if (wantUpdates && scope.future) {
    const rows: Cell[][] = [
      [{ v: "Zukünftige Normen", s: S.title }],
      [{ v: `${p.name} · Stand ${today()} · nach Termin aufsteigend`, s: S.muted }],
      [],
      ["Termin", "Terminart", "Rahmenwerk", "Rechtsakt", "Meldung", "Art", "Einschlägigkeit", "Begründung", "Frist", "Gilt ab", "Veröffentlicht", "Quelle", "Regulatory Radar"]
        .map((h) => ({ v: h, s: S.header })),
    ];
    const items = UPDATE_PAGES
      .filter((pg) => inScope(pg) && keep(results[`u:${pg.slug}`]))
      .map((pg) => ({ pg, up: upcoming(pg.u)! }))
      .sort((a, b) => dt(a.up.date).getTime() - dt(b.up.date).getTime()
        || RANK[colOf(results[`u:${a.pg.slug}`])] - RANK[colOf(results[`u:${b.pg.slug}`])]);
    for (const { pg, up } of items) {
      const r = results[`u:${pg.slug}`];
      const u = pg.u;
      rows.push([
        { date: date(up.date) }, up.kind, pg.fw.n.de, pg.fw.ref, { v: u.ti.de, s: S.wrap }, u.t.de, labelOf(r), { v: reasonOf(r), s: S.wrap },
        { date: date(u.deadline) }, { date: date(u.eff) }, { date: date(u.d) },
        u.url ? { link: u.url, text: "Quelle" } : "",
        { link: `${base}/u/${pg.slug}`, text: "Ansehen" },
      ]);
    }
    sheets.push({ name: "Zukünftige Normen", rows, widths: [12, 12, 30, 22, 60, 18, 20, 60, 12, 12, 14, 12, 16], headerRow: 4 });
  } else if (wantUpdates) {
    sheets.push(...topicSheets);
  }
  if (wantPraxis) {
    const rows: Cell[][] = [
      [{ v: "Aufsichtspraxis", s: S.title }],
      [{ v: `Stand ${today()} · neueste zuerst · Praxis-Meldungen gehören keinem Institutstyp an und werden nicht nach Einschlägigkeit bewertet`, s: S.muted }],
      [],
      ["Datum", "Art", "Meldung", "Behörde", "Kurzbeschreibung", "Quelle"].map((h) => ({ v: h, s: S.header })),
    ];
    for (const i of [...PRAXIS].sort((a, b) => dt(b.d).getTime() - dt(a.d).getTime())) {
      rows.push([
        { date: date(i.d) }, PRAXIS_CAT_LABELS[i.cat].de, { v: i.ti, s: S.wrap }, i.auth, { v: i.sum ?? "", s: S.wrap },
        i.url ? { link: i.url, text: i.src || "Quelle" } : "",
      ]);
    }
    sheets.push({ name: "Aufsichtspraxis", rows, widths: [12, 14, 60, 14, 70, 22], headerRow: 4 });
  }

  const scopeNote = [
    art === "praxis" ? "Nur Aufsichtspraxis" : art === "alle" ? "Updates und Aufsichtspraxis" : "",
    scope.future ? "nur zukünftige Normen" : "",
    scope.inst ? `Institutstyp ${scope.inst}` : "",
  ].filter(Boolean).join(", ");
  if (scopeNote) overview.rows.splice(5, 0, [{ v: `Filter von „Alle Updates“: ${scopeNote}.`, s: S.muted }]);
  overview.headerRow = (overview.headerRow ?? 6) + (scopeNote ? 1 : 0);

  return buildXlsx([overview, ...sheets], { title: `Einschlägigkeit ${p.name}` });
}
