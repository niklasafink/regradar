"use client";

import type { Lang } from "@/lib/base";
import { tx } from "@/lib/core";
import { SUBTYPES, type Subtype } from "@/lib/subtypes";

/** Zweite Filterzeile, sobald „Weitere Institute“ gewählt ist: grenzt auf die
    Rahmenwerke einer Institutsart ein (lib/subtypes.ts). */
export function SubtypeFilter({ lang, value, onChange, count }: {
  lang: Lang;
  value: Subtype | null;
  onChange: (s: Subtype | null) => void;
  /** Anzahl Einträge je Institutsart (für die Zähler). */
  count: (s: Subtype) => number;
}) {
  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
      active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
    }`;
  return (
    <nav
      className="mt-2 flex flex-wrap items-center gap-1.5"
      aria-label={lang === "de" ? "Institutsart" : "Type of institution"}
    >
      <span className="mr-1 text-xs text-slate-500">{lang === "de" ? "Institutsart:" : "Type:"}</span>
      <button type="button" className={pill(!value)} aria-pressed={!value} onClick={() => onChange(null)}>
        {lang === "de" ? "Alle" : "All"}
      </button>
      {SUBTYPES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={pill(value?.id === s.id)}
          aria-pressed={value?.id === s.id}
          onClick={() => onChange(value?.id === s.id ? null : s)}
        >
          {tx(lang, s.n)}
          <span className="num opacity-70">{count(s)}</span>
        </button>
      ))}
    </nav>
  );
}
