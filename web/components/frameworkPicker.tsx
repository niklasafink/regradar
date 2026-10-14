"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Framework } from "@/lib/data";
import { FRAMEWORKS, framePath } from "@/lib/logic";
import { useStore } from "@/lib/store";

const norm = (s: string) => s.toLowerCase();

/** Mehrfachauswahl von Rahmenwerken mit Suche für den Abo-Dialog.
    Die Liste klappt im Fluss auf (nicht absolut), damit sie im scrollenden
    Dialog nicht abgeschnitten wird. Klick toggelt, die Liste bleibt offen. */
export function FrameworkPicker({
  value,
  onChange,
  providers,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  // Gewählte Institutsarten: deren Rahmenwerke stehen oben in der Liste.
  providers: string[];
}) {
  const { lang } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const label = (f: Framework) => framePath(lang, f);

  const options = useMemo(() => {
    const needle = norm(q.trim());
    const name = (f: Framework) => framePath(lang, f);
    const hits = FRAMEWORKS.filter((f) =>
      !needle ||
      norm(`${name(f)} ${f.n.de} ${f.n.en} ${f.ref} ${f.alias ?? ""}`).includes(needle),
    );
    const rank = (f: Framework) =>
      providers.length && !f.ents.some((e) => providers.includes(e)) ? 1 : 0;
    return hits.sort(
      (a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b), lang),
    );
  }, [q, lang, providers]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      // Nur die Liste schließen, nicht den ganzen Dialog.
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && options[active]) toggle(options[active].id);
    }
  };

  const chosen = value
    .map((id) => FRAMEWORKS.find((f) => f.id === id))
    .filter((f): f is Framework => !!f);

  return (
    <div ref={boxRef}>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 transition-colors focus-within:border-slate-900">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={lang === "de" ? "Rahmenwerk suchen, z. B. DORA" : "Search framework, e.g. DORA"}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={lang === "de" ? "Liste ein-/ausklappen" : "Toggle list"}
          className="shrink-0 text-xs text-slate-400 hover:text-slate-900"
        >
          {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="mt-2 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5"
        >
          {options.length === 0 ? (
            <li className="px-4 py-2 text-sm text-slate-500">
              {lang === "de" ? "Keine Treffer für" : "No results for"} „{q.trim()}“
            </li>
          ) : (
            options.map((f, i) => {
              const checked = value.includes(f.id);
              // Kind ist über das gewählte Eltern-Rahmenwerk bereits abgedeckt.
              const inherited = !checked && !!f.parent && value.includes(f.parent);
              return (
                <li
                  key={f.id}
                  role="option"
                  aria-selected={checked || inherited}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !inherited && toggle(f.id)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-4 py-2 text-left ${
                    inherited ? "cursor-default" : "cursor-pointer"
                  } ${i === active ? "bg-slate-50" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-4 shrink-0 items-center justify-center rounded text-[10px] ${
                      checked
                        ? "bg-slate-900 text-white"
                        : inherited
                          ? "bg-slate-300 text-white"
                          : "border border-slate-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{label(f)}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {inherited
                        ? lang === "de" ? "bereits über das übergeordnete Rahmenwerk enthalten" : "already included via parent framework"
                        : f.ref}
                    </span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chosen.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-900 bg-slate-900 py-1 pl-3 pr-1.5 text-xs font-medium text-white"
            >
              {label(f)}
              <button
                type="button"
                onClick={() => toggle(f.id)}
                aria-label={`${label(f)} ${lang === "de" ? "entfernen" : "remove"}`}
                className="flex size-4 items-center justify-center rounded-full text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
