// LinkedIn-Texte: Einstiegssatz für den Share-Button auf /u/[slug] und der
// tägliche Sammel-Post (ein Beitrag pro Werktagmorgen zu allen Meldungen des
// Vortags, montags Freitag bis Sonntag). Regeln siehe LINKEDIN.md im Repo-Root.
// Aufhänger und Kernsätze schreibt der Scraper (scraper/regradar/linkedin.py)
// nach lib/linkedin.json; hier wird daraus Text und Slide-Inhalt gebaut.

import type { Update } from "./data";
import { authority } from "./logic";
import { UPDATE_PAGES, type UpdatePage } from "./updates";
import linkedinJson from "./linkedin.json";

export const AUTHORITY_ARTICLE: Record<string, string> = {
  BaFin: "Die", ESMA: "Die", EBA: "Die", EIOPA: "Die", AMLA: "Die",
  Bundesbank: "Die", EZB: "Die", "EU-Kommission": "Die", CSSF: "Die",
  BGH: "Der", EuGH: "Der", Bundestag: "Der", "EU-Rat": "Der",
  BfDI: "Der", EDPB: "Der", ESRB: "Der", SRB: "Der",
  BMF: "Das", BMI: "Das", BSI: "Das",
};

const TYPE_PHRASE: Record<string, { obj: string; verb: string }> = {
  Leitlinien: { obj: "neue Leitlinien", verb: "veröffentlicht" },
  Konsultation: { obj: "eine neue Konsultation", verb: "gestartet" },
  Rundschreiben: { obj: "ein neues Rundschreiben", verb: "veröffentlicht" },
  "Q&A": { obj: "neue Q&A", verb: "veröffentlicht" },
  ITS: { obj: "neue technische Durchführungsstandards", verb: "veröffentlicht" },
  Gesetz: { obj: "ein neues Gesetz", verb: "verkündet" },
  Gesetzentwurf: { obj: "einen neuen Gesetzentwurf", verb: "vorgelegt" },
  Urteil: { obj: "ein neues Urteil", verb: "veröffentlicht" },
  Allgemeinverfügung: { obj: "eine neue Allgemeinverfügung", verb: "erlassen" },
  Meldung: { obj: "eine neue Meldung", verb: "veröffentlicht" },
};

/** Einstiegssatz „Die ESMA hat am 27.08.2026 neue Leitlinien veröffentlicht: „…“.“ */
export function shareOpener(u: Update): string {
  const name = authority(u.src);
  const phrase = TYPE_PHRASE[u.t.de] ?? TYPE_PHRASE.Meldung;
  if (["EU-Amtsblatt", "BGBl", "Bundesrecht"].includes(name))
    return `Im ${name === "BGBl" ? "Bundesgesetzblatt" : name} wurde am ${u.d} Folgendes veröffentlicht: „${u.ti.de}“.`;
  if (name === "ESAs")
    return `Die ESAs haben am ${u.d} ${phrase.obj} ${phrase.verb}: „${u.ti.de}“.`;
  const art = AUTHORITY_ARTICLE[name];
  return `${art ? `${art} ` : ""}${name} hat am ${u.d} ${phrase.obj} ${phrase.verb}: „${u.ti.de}“.`;
}

export const hashtag = (s: string) => s.replace(/[^0-9A-Za-zÄÖÜäöüß]/g, "");

/* ---------- Tages-Post ---------- */

interface StoredPost {
  window: string[];
  keys: string[];
  hook: string;
  /** Überschrift der Titel-Slide zur Aufhänger-Meldung, höchstens ca. 55 Zeichen */
  cover?: string;
  /** was die Aufhänger-Meldung praktisch fürs Institut heißt */
  folge?: string;
  /** Kurzzeilen zu den übrigen Meldungen („ESMA: …“) */
  zeilen?: string[];
  /** Fachfrage an die Leser am Schluss */
  frage?: string;
  /** Meldung, auf die sich der Aufhänger bezieht (erste Slide) */
  top?: string;
  kern: Record<string, string>;
  /** Meldungen zum selben Dokument wie eine andere (Bericht + Tabelle): keine eigene Slide */
  doppelt?: string[];
}

const POSTS = (linkedinJson as { posts: Record<string, StoredPost> }).posts;

export interface DigestItem {
  page: UpdatePage;
  kern: string;
}

export interface Digest {
  /** Posttag im Format YYYY-MM-DD */
  day: string;
  /** abgedeckte Meldungstage, YYYY-MM-DD */
  window: string[];
  hook: string;
  /** Überschrift der Titel-Slide (fällt auf den Aufhänger zurück) */
  cover: string;
  items: DigestItem[];
  /** fertiger Post-Text für LinkedIn (ohne Link, der steht im Kommentar) */
  text: string;
  /** erster Kommentar unter dem Post, trägt den Link */
  comment: string;
  /** Titel des PDF-Dokuments (Slideshow) */
  title: string;
  /** Anzahl der Slides: Titel, je Meldung eine, Abschluss */
  slides: number;
}

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const IMP_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** "2026-10-13" -> "13.10.2026" */
export const deDate = (iso: string) => iso.split("-").reverse().join(".");
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Datum bzw. Zeitraum der Meldungen als Satzteil. */
export function windowLabel(window: string[]): string {
  const first = window[0];
  const last = window[window.length - 1];
  if (first === last) return `${weekday(first)}, ${deDate(first)}`;
  return `${weekday(first)}, ${deDate(first)}, bis ${weekday(last)}, ${deDate(last)}`;
}

/** Kurzname des Rahmenwerks als Hashtag (DORA, MiCA, PSD3), lange Namen ohne Kürzel entfallen. */
const fwTag = (name: string): string => {
  const first = hashtag(name.split(/[:/(]|\s[–-]\s/)[0].trim().split(/\s+/)[0] ?? "");
  return first.length >= 2 && first.length <= 12 && /[A-Z].*[A-Z0-9]/.test(first) ? first : "";
};

const keyOf = (u: Update) => u.sl ?? u.url ?? u.ti.de;

export function digestFor(day: string): Digest | undefined {
  const post = POSTS[day];
  if (!post) return undefined;
  const items: DigestItem[] = [];
  for (const key of post.keys) {
    if (post.doppelt?.includes(key)) continue;
    const page = UPDATE_PAGES.find((p) => keyOf(p.u) === key);
    if (page) items.push({ page, kern: post.kern[key] ?? "" });
  }
  if (!items.length) return undefined;
  const isTop = (i: DigestItem) => (keyOf(i.page.u) === post.top ? 0 : 1);
  items.sort((a, b) =>
    (isTop(a) - isTop(b))
    || (IMP_RANK[a.page.u.imp ?? "low"] - IMP_RANK[b.page.u.imp ?? "low"])
    || authority(a.page.u.src).localeCompare(authority(b.page.u.src)));

  const n = items.length;
  const others = n - 1 - (post.zeilen?.length ?? 0);
  // „Außerdem gestern“ bzw. „Außerdem seit Freitag“ (Montags-Post über das Wochenende).
  const since = post.window.length > 1 ? `seit ${weekday(post.window[0])}` : "gestern";
  const lines = [
    ...(post.zeilen ?? []).map((z) => `→ ${z}`),
    ...(others > 0 ? [`→ ${others === 1 ? "1 weitere Meldung" : `${others} weitere Meldungen`} in der Slideshow`] : []),
  ];
  // Fünf Hashtags (ab sechs sinkt laut Datenlage die Reichweite): Rahmenwerk und
  // Behörde der Aufhänger-Meldung, dazu feste Themen-Tags.
  const tags = [
    ...new Set([
      fwTag(items[0].page.fw.n.de),
      hashtag(authority(items[0].page.u.src)),
      "Rechtsmonitoring",
      "Compliance",
      "Regulatorik",
      "Finanzaufsicht",
    ].filter(Boolean)),
  ].slice(0, 5).map((h) => `#${h}`).join(" ");
  // Schluss: Werbung für regradar.de, der Link steht im ersten Kommentar.
  const promo = "Kostenloses Rechtsmonitoring für Finanzinstitute: Regulatory Radar sammelt "
    + "diese Meldungen jeden Tag, zu jeder Meldung mit Zusammenfassung und Quelle. "
    + "Auf Wunsch jeden Donnerstag per E-Mail, nur zu Ihren Rahmenwerken. Link im ersten Kommentar.";
  const text = [
    post.hook,
    post.folge ?? "",
    lines.length ? `Außerdem ${since}:\n${lines.join("\n")}` : "",
    post.frage ?? "",
    promo,
    tags,
  ].filter(Boolean).join("\n\n");

  return {
    day,
    window: post.window,
    hook: post.hook,
    cover: post.cover ?? post.hook,
    items,
    text,
    comment: "Alle Meldungen mit Zusammenfassung und Quelle, kostenlos: https://regradar.de/updates",
    title: post.window.length === 1
      ? `Regulatorik-Update vom ${deDate(post.window[0])}`
      : `Regulatorik-Update vom ${deDate(post.window[0]).slice(0, 6)} bis ${deDate(post.window[post.window.length - 1])}`,
    slides: n + 2,
  };
}

/** Alle Posttage mit Inhalt, neueste zuerst. */
export const digestDays = (): string[] => Object.keys(POSTS).sort().reverse();
