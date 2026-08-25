"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import type { Framework, Update } from "@/lib/data";
import { FRAMEWORKS, authority, dt, fmtDate, tx } from "@/lib/logic";
import { useStore } from "@/lib/store";

interface Hit {
  key: string;
  href: string;
  title: string;
  meta: string;
  kind: "framework" | "update";
  date?: string;
}

const norm = (s: string) => s.toLowerCase();

function fwHref(f: Framework, provider?: string) {
  const p = provider && f.ents.includes(provider) ? provider : f.ents[0];
  return `/r/${p}/f/${f.id}`;
}

function buildHits(q: string, lang: "de" | "en", provider?: string): Hit[] {
  const needle = norm(q.trim());
  if (needle.length < 2) return [];

  const fws: Hit[] = [];
  const ups: { hit: Hit; d: Date }[] = [];

  for (const f of FRAMEWORKS) {
    const fwText = `${f.n.de} ${f.n.en} ${f.ref}`;
    if (norm(fwText).includes(needle)) {
      fws.push({
        key: `f-${f.id}`,
        href: fwHref(f, provider),
        title: tx(lang, f.n),
        meta: `${f.ref}, ${f.jur}`,
        kind: "framework",
      });
    }
    for (const u of f.u as Update[]) {
      const uText = `${u.ti.de} ${u.ti.en} ${u.refnum ?? ""} ${u.src}`;
      if (norm(uText).includes(needle)) {
        ups.push({
          d: dt(u.d),
          hit: {
            key: `u-${f.id}-${u.d}-${u.ti.de.slice(0, 40)}`,
            href: fwHref(f, provider),
            title: tx(lang, u.ti),
            meta: `${authority(u.src)}, ${tx(lang, f.n)}`,
            kind: "update",
            date: fmtDate(lang, u.d),
          },
        });
      }
    }
  }
  ups.sort((a, b) => b.d.getTime() - a.d.getTime());
  return [...fws.slice(0, 3), ...ups.map((x) => x.hit)].slice(0, 8);
}

export function SearchBox({ provider }: { provider?: string }) {
  const { lang } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => buildHits(q, lang, provider), [q, lang, provider]);

  useEffect(() => setActive(0), [q]);

  // Klick außerhalb schließt die Ergebnisliste
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Tastaturkürzel „/" fokussiert die Suche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      go(hits[active]);
    }
  };

  const showResults = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 sm:max-w-xs">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 transition-colors focus-within:border-slate-900">
        <SearchIcon aria-hidden className="size-3.5 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={lang === "de" ? "Rahmenwerke und Updates suchen" : "Search frameworks and updates"}
          aria-label={lang === "de" ? "Suche" : "Search"}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-400 sm:block">/</kbd>
      </div>

      {showResults && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[28rem] sm:right-auto">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              {lang === "de" ? "Keine Treffer für" : "No results for"} „{q.trim()}“
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1.5">
              {hits.map((h, i) => (
                <li key={h.key}>
                  <button
                    type="button"
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${
                      i === active ? "bg-slate-50" : ""
                    }`}
                  >
                    <span className="shrink-0 pt-0.5">
                      {h.kind === "framework" ? (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                          {lang === "de" ? "Rahmenwerk" : "Framework"}
                        </span>
                      ) : (
                        <span className="num text-xs text-slate-400">{h.date}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {h.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{h.meta}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
