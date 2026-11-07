"use client";

import { hintFor } from "@/lib/relevance/hints";

/** Aufklappbare Entscheidungshilfe zu einem Profilmerkmal. */
export function RelevanceHint({ merkmal, className = "" }: { merkmal: string; className?: string }) {
  const h = hintFor(merkmal);
  if (!h) return null;
  return (
    <details className={`group text-left text-xs ${className}`}>
      <summary className="cursor-pointer list-none text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Hinweise zur Entscheidung</span>
        <span className="hidden group-open:inline">Hinweise ausblenden</span>
      </summary>
      <div className="mt-2 space-y-2 rounded-xl bg-slate-50 px-3 py-2.5 leading-relaxed text-slate-600">
        <p>{h.hinweis}</p>
        <ul className="list-disc space-y-1 pl-4">
          {h.pruefen.map((q) => <li key={q}>{q}</li>)}
        </ul>
        {h.quelle && <p className="text-slate-500">Nachsehen in: {h.quelle}</p>}
      </div>
    </details>
  );
}
