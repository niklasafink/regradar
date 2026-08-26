"use client";

// Vertrauenssignal: zeigt, wann der Scraper die Live-Daten zuletzt
// exportiert hat ("vor X Stunden"). Die Relativzeit wird erst nach dem
// Mount berechnet, damit Server- und Client-HTML identisch bleiben.

import { useEffect, useState } from "react";
import { LIVE_GENERATED_AT } from "@/lib/live";
import { useStore } from "@/lib/store";

function label(lang: "de" | "en", hours: number): string {
  if (hours < 1) return lang === "de" ? "vor wenigen Minuten" : "minutes ago";
  if (hours < 48) {
    return lang === "de"
      ? `vor ${hours} ${hours === 1 ? "Stunde" : "Stunden"}`
      : `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.round(hours / 24);
  return lang === "de" ? `vor ${days} Tagen` : `${days} days ago`;
}

export function LastUpdated({ className = "" }: { className?: string }) {
  const { lang } = useStore();
  const [hours, setHours] = useState<number | null>(null);

  useEffect(() => {
    const ms = Date.now() - new Date(LIVE_GENERATED_AT).getTime();
    setHours(Math.max(0, Math.floor(ms / 3600000)));
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-500 ${className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-blue-600" />
      {lang === "de" ? "Zuletzt aktualisiert" : "Last updated"}
      {hours !== null && <span className="num">{label(lang, hours)}</span>}
    </span>
  );
}
