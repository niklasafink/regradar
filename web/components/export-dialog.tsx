"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { activeName, STATUS_LABEL, type Me, type Status } from "@/lib/relevanceClient";
import { track } from "@/lib/track";

const ORDER: Status[] = ["ja", "teilweise", "nein", "unsicher"];

/** Button „Export“ mit kleinem Dialog: Status wählen, Excel laden. Nur für
    angemeldete Nutzer; Gäste sehen den Hinweis zur Anmeldung. */
export interface ExportScope { art: "updates" | "praxis" | "alle"; future: boolean; inst: string | null }

export function ExportButton({ me, className = "", scope }: { me: Me | null; className?: string; scope?: ExportScope }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Set<Status>>(new Set(ORDER));

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const toggle = (s: Status) => {
    const next = new Set(pick);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setPick(next);
  };
  const download = () => {
    const status = ORDER.filter((s) => pick.has(s)).join(",");
    track("relevance_export", { status, art: scope?.art ?? "updates", future: String(!!scope?.future) });
    const q = new URLSearchParams({ status });
    if (scope?.art && scope.art !== "updates") q.set("art", scope.art);
    if (scope?.future) q.set("future", "1");
    if (scope?.inst) q.set("inst", scope.inst);
    window.location.href = `/api/relevance/export?${q}`;
    setOpen(false);
  };

  const btn = "rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40";
  const ghost = "rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900";
  const praxisOnly = scope?.art === "praxis";
  const scopeText = [
    praxisOnly ? "nur Aufsichtspraxis" : scope?.art === "alle" ? "Updates und Aufsichtspraxis" : "",
    scope?.future ? "nur zukünftige Normen, nach Termin sortiert" : "",
    scope?.inst ? "gewählter Institutstyp" : "",
  ].filter(Boolean).join(", ");
  const loggedIn = !!me?.loggedIn;
  const withProfile = loggedIn && me!.profiles.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`shrink-0 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-900 hover:text-slate-900 ${className}`}
      >
        Export
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 id="export-title" className="font-heading text-lg font-medium tracking-tight">Export</h2>
            {!loggedIn ? (
              <>
                <p className="mt-2 text-sm text-slate-600">Bitte melden Sie sich mit Ihrer Firmen-E-Mail-Adresse an.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className={ghost} onClick={() => setOpen(false)}>Abbrechen</button>
                  <Link href="/profil?anmelden=1" className={btn}>Anmelden</Link>
                </div>
              </>
            ) : !withProfile ? (
              <>
                <p className="mt-2 text-sm text-slate-600">Bitte legen Sie zuerst ein Institutsprofil an.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className={ghost} onClick={() => setOpen(false)}>Abbrechen</button>
                  <Link href="/profil?neu=1" className={btn}>Profil anlegen</Link>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">Excel für {activeName(me)}</p>
                {scopeText && <p className="mt-2 text-xs text-slate-500">Mit Ihren Filtern: {scopeText}.</p>}
                <fieldset className={`mt-4 space-y-2 ${praxisOnly ? "hidden" : ""}`}>
                  <legend className="sr-only">Einschlägigkeit</legend>
                  {ORDER.map((s) => (
                    <label key={s} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
                      <input type="checkbox" checked={pick.has(s)} onChange={() => toggle(s)} className="size-4 accent-slate-900" />
                      {STATUS_LABEL[s]}
                    </label>
                  ))}
                </fieldset>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className={ghost} onClick={() => setOpen(false)}>Abbrechen</button>
                  <button type="button" className={btn} disabled={!pick.size && !praxisOnly} onClick={download}>Herunterladen</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
