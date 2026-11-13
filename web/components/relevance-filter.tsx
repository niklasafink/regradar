"use client";

import { useEffect, useRef, useState } from "react";
import {
  isPending, normRelFilter, relMatches, STATUS_LABEL, type MatchResult, type RelFilter, type Status,
} from "@/lib/relevanceClient";

const isOn = (v: RelFilter, s: Status) => v !== "alle" && v.includes(s);
/** Status an- oder abwählen; die übrige Auswahl bleibt bestehen. */
const toggle = (v: RelFilter, s: Status): RelFilter =>
  normRelFilter(v === "alle" ? [s] : v.includes(s) ? v.filter((x) => x !== s) : [...v, s]);

const ORDER: Status[] = ["ja", "teilweise", "nein", "unsicher"];
const SHORT: Record<Status, string> = {
  ja: "Einschlägig",
  teilweise: "Teilweise",
  nein: "Nicht einschlägig",
  unsicher: "Unklar",
};

/** Filterleiste „Alle / Einschlägig / Teilweise / Nicht einschlägig / Unklar“
    mit Anzahl je Status. Mehrere Status sind kombinierbar. Nur sichtbar, wenn ein Profil vorliegt (`show`). */
export function RelevanceFilter({
  keys, rel, value, onChange, show, className = "", variant = "pills",
}: {
  keys: string[];
  rel: Record<string, MatchResult>;
  value: RelFilter;
  onChange: (f: RelFilter) => void;
  show: boolean;
  className?: string;
  /** "dropdown": ein Knopf mit Menü statt einer Pillenreihe (spart Platz in Filterzeilen) */
  variant?: "pills" | "dropdown";
}) {
  if (!show) return null;
  if (variant === "dropdown") return <RelevanceDropdown keys={keys} rel={rel} value={value} onChange={onChange} className={className} />;
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
            className={pill(isOn(value, s))}
            aria-pressed={isOn(value, s)}
            onClick={() => onChange(toggle(value, s))}
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

function RelevanceDropdown({
  keys, rel, value, onChange, className,
}: {
  keys: string[];
  rel: Record<string, MatchResult>;
  value: RelFilter;
  onChange: (f: RelFilter) => void;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const count = (f: Status) => keys.filter((k) => relMatches(f, rel[k])).length;
  const open_ = keys.filter((k) => !rel[k] || isPending(rel[k])).length;
  const active = value !== "alle";
  const curLabel = !active ? "Alle" : value.length === 1 ? SHORT[value[0]] : `${value.length} ausgewählt`;
  const curN = !active ? keys.length : keys.filter((k) => relMatches(value, rel[k])).length;
  const item = (on: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
      on ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
    }`;
  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          active
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
        }`}
      >
        <span className={active ? "opacity-70" : "text-slate-400"}>Einschlägigkeit:</span>
        {curLabel}
        <span className="num text-xs opacity-70">{curN}</span>
        <svg aria-hidden viewBox="0 0 12 12" className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" aria-label="Einschlägigkeit" className="absolute left-0 z-30 mt-1.5 w-64 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <button
            type="button"
            role="option"
            aria-selected={!active}
            onClick={() => { onChange("alle"); setOpen(false); }}
            className={item(!active)}
          >
            Alle
            <span className="num text-xs opacity-70">{keys.length}</span>
          </button>
          {ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={isOn(value, s)}
              onClick={() => onChange(toggle(value, s))}
              className={item(isOn(value, s))}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className={`grid size-3.5 place-items-center rounded border ${isOn(value, s) ? "border-white" : "border-slate-300"}`}>
                  {isOn(value, s) && (
                    <svg viewBox="0 0 12 12" className="size-2.5"><path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </span>
                {SHORT[s]}
              </span>
              <span className="num text-xs opacity-70">{count(s)}</span>
            </button>
          ))}
          {open_ > 0 && (
            <p className="px-3 pb-1.5 pt-2 text-xs text-slate-400">
              {open_} {open_ === 1 ? "Eintrag" : "Einträge"} noch nicht geprüft, nur unter „Alle“ sichtbar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
