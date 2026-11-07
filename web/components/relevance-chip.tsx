"use client";

import { isPending, STATUS_LABEL, statusPill, type MatchResult } from "@/lib/relevanceClient";

/** Kleiner Status-Chip „Einschlägig / Teilweise / Nicht / Unklar“ mit Begründung als Tooltip. */
export function RelevanceChip({ r, name }: { r?: MatchResult; name?: string | null }) {
  if (!r) return null;
  if (isPending(r)) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] font-medium text-slate-400" title="Die Einschlägigkeit wird gerade geprüft.">
        Wird geprüft …
      </span>
    );
  }
  return (
    <span className={statusPill(r.status)} title={`${name ? `Für ${name}: ` : ""}${r.grund}`}>
      {STATUS_LABEL[r.status]}
    </span>
  );
}
