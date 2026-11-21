"use client";

import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

/** Gliederung rechts wie in Notion: bleibt beim Scrollen sichtbar, markiert den aktuellen Abschnitt. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav aria-label="Gliederung" className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-auto lg:block print:hidden">
      <p className="mb-2 text-xs font-medium text-slate-400">Auf dieser Seite</p>
      <ul className="border-l border-slate-200">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              className={`-ml-px block border-l py-1 pl-3 text-sm transition-colors ${
                active === i.id
                  ? "border-slate-900 font-medium text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
