"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { Lang } from "@/lib/base";
import { tx } from "@/lib/core";
import { SUBTYPES, SUBTYPE_GROUPS } from "@/lib/subtypes";

/** Kachel „Weitere Institute“ auf der Startseite: öffnet die Auswahl der
    Institutsart statt direkt auf die Sammelseite zu führen. Auf dem Handy
    erscheint der Dialog als Blatt am unteren Rand. */
export function OtherInstitutesTile({ lang, slug, label, className }: {
  lang: Lang; slug: string; label: string; className: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
        className={className}
      >
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-slate-500" />
      </button>

      <dialog
        ref={ref}
        aria-labelledby="institute-dialog-title"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        className="m-auto w-[min(840px,calc(100vw-2rem))] max-h-[min(86vh,760px)] rounded-3xl bg-white p-0 text-left text-slate-900 shadow-[0_2px_4px_rgb(31_30_26/0.05),0_18px_48px_rgb(31_30_26/0.16)] max-sm:mb-0 max-sm:w-screen max-sm:max-w-none max-sm:rounded-b-none"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-6 pb-2 sm:px-7 sm:pt-7">
          <h2 id="institute-dialog-title" className="font-heading text-balance text-xl font-semibold tracking-tight sm:text-[1.375rem]">
            {lang === "de" ? "Welche Art von Institut sind Sie?" : "What type of institution are you?"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={lang === "de" ? "Schließen" : "Close"}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-slate-200 hover:border-slate-900"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="grid gap-3.5 px-5 pt-3 pb-2 sm:px-7">
          {SUBTYPE_GROUPS.map((g) => (
            <div key={g.id}>
              <h3 className="mb-2 text-[0.8125rem] font-semibold text-slate-500">{tx(lang, g.n)}</h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
                {SUBTYPES.filter((s) => s.g === g.id).map((s) => (
                  <Link
                    key={s.slug}
                    href={`/r/${slug}/${s.slug}`}
                    onClick={close}
                    data-fast-goal="institute_selected"
                    data-fast-goal-institute={`OTH:${s.id}`}
                    data-fast-goal-source="home_dialog"
                    className="flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 transition-colors hover:border-slate-900 hover:bg-slate-50"
                  >
                    <span className="truncate text-sm font-semibold">{tx(lang, s.n)}</span>
                    <ChevronRight aria-hidden className="size-3.5 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 pt-4 pb-[calc(1.375rem+env(safe-area-inset-bottom,0px))] sm:px-7">
          <p className="text-[0.8125rem] text-slate-600">
            {lang === "de" ? "Ihre Institutsart ist nicht dabei?" : "Your type of institution is not listed?"}
          </p>
          <Link
            href={`/r/${slug}`}
            onClick={close}
            data-fast-goal="institute_selected"
            data-fast-goal-institute="OTH"
            data-fast-goal-source="home_dialog"
            className="rounded-full border border-slate-900 px-4 py-2 text-[0.8125rem] font-medium hover:bg-slate-900 hover:text-white"
          >
            {lang === "de" ? "Alle Rahmenwerke für weitere Institute" : "All frameworks for other institutions"}
          </Link>
        </div>
      </dialog>
    </>
  );
}
