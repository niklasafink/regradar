"use client";

import { STATUS_LABEL, statusPill, type MatchResult } from "@/lib/relevanceClient";

/** Kleiner Status-Chip „Einschlägig / Teilweise / Nicht / Unklar“ mit Begründung als Tooltip. */
export function RelevanceChip({ r, name }: { r?: MatchResult; name?: string | null }) {
  if (!r) return null;
  return (
    <span className={statusPill(r.status)} title={`${name ? `Für ${name}: ` : ""}${r.grund}`}>
      {STATUS_LABEL[r.status]}
    </span>
  );
}
