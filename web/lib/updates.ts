// Flacher, stabiler Index über alle Updates (statisch + live) für die
// SEO-Einzelseiten unter /u/[slug] und die Sitemap. Slugs sind deterministisch
// aus Rahmenwerk, Datum und Titel abgeleitet, damit URLs über Rebuilds hinweg
// stabil bleiben.

import type { Framework, Update } from "./data";
import { dt, FRAMEWORKS } from "./logic";

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

/** Erster Absatz einer mehrabsätzigen Zusammenfassung (für Listen, E-Mails
 *  und Meta-Descriptions; die Detailseite zeigt alle Absätze). */
export const firstParagraph = (s: string): string =>
  s.split(/\n{2,}/)[0]?.trim() ?? s;

/** "24.08.2026" -> "2026-08-24" */
export const isoDate = (d: string): string => {
  const [day, month, year] = d.split(".");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

export interface UpdatePage {
  slug: string;
  fw: Framework;
  u: Update;
}

function buildIndex(): { list: UpdatePage[]; bySlug: Map<string, UpdatePage> } {
  const list: UpdatePage[] = [];
  const bySlug = new Map<string, UpdatePage>();
  for (const fw of FRAMEWORKS) {
    for (const u of fw.u) {
      const base = [fw.id, isoDate(u.d), u.sl ?? slugify(u.ti.de)]
        .filter(Boolean).join("-");
      let slug = base;
      for (let n = 2; bySlug.has(slug); n++) slug = `${base}-${n}`;
      const page = { slug, fw, u };
      bySlug.set(slug, page);
      list.push(page);
    }
  }
  list.sort((a, b) => dt(b.u.d).getTime() - dt(a.u.d).getTime());
  return { list, bySlug };
}

const idx = buildIndex();

/** Alle Update-Seiten, neueste zuerst. */
export const UPDATE_PAGES: UpdatePage[] = idx.list;

export const updateBySlug = (slug: string): UpdatePage | undefined =>
  idx.bySlug.get(slug);

/** Kanonische URL-Pfad-Komponente eines Updates. */
export const updateHref = (fwId: string, u: Update): string => {
  const hit = idx.list.find((p) => p.fw.id === fwId && p.u === u)
    ?? idx.list.find(
      (p) => p.fw.id === fwId && p.u.d === u.d && p.u.ti.de === u.ti.de,
    );
  return hit
    ? `/u/${hit.slug}`
    : `/u/${[fwId, isoDate(u.d), u.sl ?? slugify(u.ti.de)].filter(Boolean).join("-")}`;
};
