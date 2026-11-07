"use client";

import {
  isPending, relMatches, STATUS_LABEL, type MatchResult, type RelFilter, type Status,
} from "@/lib/relevanceClient";

const ORDER: Status[] = ["ja", "teilweise", "nein", "unsicher"];
const SHORT: Record<Status, string> = {
  ja: "Einschlägig",
  teilweise: "Teilweise",
  nein: "Nicht einschlägig",
  unsicher: "Unklar",
};

/** Filterleiste „Alle / Einschlägig / Teilweise / Nicht einschlägig / Unklar“
    mit Anzahl je Status. Nur sichtbar, wenn ein Profil vorliegt (`show`). */
export function RelevanceFilter({
  keys, rel, value, onChange, show, className = "",
}: {
  keys: string[];
  rel: Record<string, MatchResult>;
  value: RelFilter;
  onChange: (f: RelFilter) => void;
  show: boolean;
  className?: string;
}) {
  if (!show) return null;
  const count = (f: Status) => keys.filter((k) => relMatches(f, rel[k])).length;
  const open = keys.filter((k) => !rel[k] || isPending(rel[k])).length;
  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
    }`;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <nav className="contents" aria-label="Einschlägigkeit">
        <button type="button" className={pill(value === "alle")} aria-pressed={value === "alle"} onClick={() => onChange("alle")}>
          Alle
          <span className="num text-xs opacity-70">{keys.length}</span>
        </button>
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            title={STATUS_LABEL[s]}
            className={pill(value === s)}
            aria-pressed={value === s}
            onClick={() => onChange(value === s ? "alle" : s)}
          >
            {SHORT[s]}
            <span className="num text-xs opacity-70">{count(s)}</span>
          </button>
        ))}
      </nav>
      {value !== "alle" && open > 0 && (
        <span className="text-xs text-slate-400">
          {open} {open === 1 ? "Eintrag" : "Einträge"} noch nicht geprüft, nur unter „Alle“ sichtbar.
        </span>
      )}
    </div>
  );
}
