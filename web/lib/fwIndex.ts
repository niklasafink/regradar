"use client";

// Rahmenwerkliste mit Update-Titeln für Client-Komponenten (Abo-Dialog,
// Suche), nachgeladen aus /fw-index.json. Hält data.ts/live.json aus den
// Seiten-Bundles heraus.

import { useEffect, useState } from "react";
import type { Lang, Txt } from "./base";
import { tx } from "./core";

export interface FwLite {
  id: string; n: Txt; ref: string; jur: string; ents: string[];
  sn?: Txt; parent?: string; alias?: string;
  /** Updates nur mit den Feldern, die die Suche braucht. */
  u: { d: string; ti: Txt; src: string; refnum?: string }[];
}

let cache: Promise<FwLite[]> | null = null;

const load = (): Promise<FwLite[]> =>
  (cache ??= fetch("/fw-index.json")
    .then((r) => (r.ok ? (r.json() as Promise<FwLite[]>) : Promise.reject(r.status)))
    .catch((e) => {
      cache = null;
      throw e;
    }));

/** Liste aller Rahmenwerke; `null`, solange sie lädt. Mit `enabled = false`
    wird nichts geladen. */
export function useFrameworkIndex(enabled = true): FwLite[] | null {
  const [list, setList] = useState<FwLite[] | null>(null);
  useEffect(() => {
    if (!enabled || list) return;
    let alive = true;
    load().then((l) => alive && setList(l)).catch(() => {});
    return () => { alive = false; };
  }, [enabled, list]);
  return list;
}

/** Anzeigename wie framePath in logic.ts: Kinder mit Elternpfad. */
export const framePathLite = (lang: Lang, f: FwLite, list: FwLite[]): string => {
  const p = f.parent ? list.find((x) => x.id === f.parent) : undefined;
  return p ? `${tx(lang, p.n)} › ${tx(lang, f.sn ?? f.n)}` : tx(lang, f.n);
};
