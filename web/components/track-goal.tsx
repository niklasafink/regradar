"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/** Feuert ein DataFast-Goal beim Anzeigen der Seite (für Server Components). */
export function TrackGoal({
  goal,
  params,
}: {
  goal: string;
  params?: Record<string, string>;
}) {
  useEffect(() => {
    track(goal, params);
    // params ist bei jedem Render ein neues Objekt, deshalb nur an goal koppeln
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  return null;
}
