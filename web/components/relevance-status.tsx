"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  activeName, answerQuestion, hasProfile, isPending, setStatus, STATUS_LABEL, statusPill,
  useMe, useRelevance, type Status,
} from "@/lib/relevanceClient";
import { RelevanceHint } from "./relevance-hint";

const CHOICES: Status[] = ["ja", "teilweise", "nein", "unsicher"];

/** Status oben rechts auf Detailseiten (Update, Rahmenwerk): gut sichtbarer
    Chip; ein Klick zeigt den Grund in einem Satz, bei „Unklar“ die offenen
    Fragen zum direkten Beantworten und (angemeldet) die Möglichkeit, den
    Status selbst festzulegen. */
export function RelevanceStatus({ target, className = "" }: { target: string; className?: string }) {
  const me = useMe();
  const withProfile = hasProfile(me);
  const res = useRelevance([target], withProfile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!me || !withProfile) return null;
  const r = res[target];
  const name = activeName(me);
  const manual = r?.stufe === "nutzer";
  const choose = async (s: Status | null) => {
    setBusy(true);
    try { await setStatus(target, s); } finally { setBusy(false); }
  };

  if (!r || isPending(r)) {
    return (
      <span className={`inline-flex shrink-0 items-center rounded-full border border-dashed border-slate-300 px-3.5 py-1 text-xs font-medium text-slate-400 ${className}`}>
        Wird geprüft …
      </span>
    );
  }

  const questions = r.status === "unsicher"
    ? [...(r.frage ? [r.frage] : []), ...(r.weitere ?? [])].filter((q, i, a) => a.findIndex((x) => x.merkmal === q.merkmal) === i)
    : [];

  return (
    <div ref={box} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${statusPill(r.status).replace("px-2.5 py-0.5 text-[11px]", "px-3.5 py-1 text-xs")} gap-1.5 hover:opacity-80`}
        title={`Für ${name}: ${r.grund}`}
      >
        {STATUS_LABEL[r.status]}
        <span aria-hidden className="text-[10px]">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm shadow-lg">
          <p className="text-xs text-slate-500">Für {name}</p>
          <p className="leading-relaxed text-slate-800">
            {r.grund}
            {r.status === "teilweise" && r.teile ? ` Es gelten: ${r.teile}` : ""}
          </p>
          {questions.length > 0 && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-900">Mit diesen Angaben wird es eindeutig:</p>
              {questions.map((q) => (
                <div key={q.merkmal} className="space-y-1.5">
                  <p className="text-slate-700">{q.frage}</p>
                  <div className="flex gap-1.5">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try { await answerQuestion(me, q.merkmal, v); } finally { setBusy(false); }
                        }}
                        className="rounded-full border border-slate-900 px-3 py-0.5 text-xs font-medium text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-50"
                      >
                        {v ? "Ja" : "Nein"}
                      </button>
                    ))}
                  </div>
                  <RelevanceHint merkmal={q.merkmal} />
                </div>
              ))}
            </div>
          )}
          {me.loggedIn && (
            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
              <p className="font-medium text-slate-900">Status selbst festlegen</p>
              <div className="flex flex-wrap gap-1.5">
                {CHOICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy || (manual && r.status === s)}
                    aria-pressed={manual && r.status === s}
                    onClick={() => choose(s)}
                    className={`rounded-full px-3 py-0.5 font-medium disabled:cursor-default ${
                      manual && r.status === s
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 text-slate-700 hover:border-slate-900 hover:text-slate-900 disabled:opacity-50"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {manual && (
                <p className="text-slate-500">
                  {r.auto ? `Automatische Einschätzung: ${STATUS_LABEL[r.auto.status]}. ` : ""}
                  <button type="button" disabled={busy} onClick={() => choose(null)} className="font-medium text-slate-900 underline-offset-2 hover:underline disabled:opacity-50">
                    Automatische Einschätzung verwenden
                  </button>
                </p>
              )}
            </div>
          )}
          <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
            Automatische Einschätzung, keine Rechtsberatung. <Link href="/profil" className="underline-offset-2 hover:text-slate-900 hover:underline">Profil ansehen</Link>
          </p>
        </div>
      )}
    </div>
  );
}
