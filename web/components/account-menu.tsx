"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { activeName, invalidate, useMe } from "@/lib/relevanceClient";

/** Oben rechts: Anmeldestatus, aktives Institutsprofil und Profilwechsel. */
export function AccountMenu() {
  const me = useMe();
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!me) return <span className="w-[4.5rem] shrink-0" aria-hidden />;

  if (!me.loggedIn) {
    return (
      <Link
        href="/profil?anmelden=1"
        className="shrink-0 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-900 hover:text-slate-900"
      >
        Anmelden
      </Link>
    );
  }

  const name = activeName(me);
  const activate = async (id: string) => {
    setOpen(false);
    await fetch("/api/account/profile", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", id }),
    });
    invalidate();
  };

  const item = "flex w-full items-center justify-between gap-3 rounded-full px-3.5 py-2 text-left text-[13px] font-medium transition-colors";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        title={me.email ?? undefined}
        className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
      >
        <span className="truncate">{name ?? "Mein Konto"}</span>
        <svg aria-hidden viewBox="0 0 256 256" fill="currentColor" className={`size-3 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
          <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 pt-2">
          <div role="menu" className="w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
            <p className="truncate px-3.5 pb-1.5 pt-1 text-xs text-slate-500">Angemeldet als {me.email}</p>
            {me.profiles.length > 0 && (
              <p className="px-3.5 pb-1 pt-1 text-xs text-slate-400">Einschlägigkeit prüfen für</p>
            )}
            {me.profiles.map((p) => {
              const active = p.id === me.activeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => (active ? setOpen(false) : void activate(p.id))}
                  className={`${item} ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"}`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-[11px] opacity-70">
                    {[p.id === me.primaryId ? "primär" : "", active ? "aktiv" : ""].filter(Boolean).join(", ")}
                  </span>
                </button>
              );
            })}
            <div className="my-1.5 border-t border-slate-100" />
            <Link role="menuitem" href={`/profil?neu=1${pathname.startsWith("/profil") ? "" : `&next=${encodeURIComponent(pathname)}`}`} onClick={() => setOpen(false)} className={`${item} text-slate-700 hover:bg-slate-100 hover:text-slate-900`}>
              Weiteres Institut anlegen
            </Link>
            <Link role="menuitem" href="/profil" onClick={() => setOpen(false)} className={`${item} text-slate-700 hover:bg-slate-100 hover:text-slate-900`}>
              Profile verwalten
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                invalidate();
                window.location.href = "/";
              }}
              className={`${item} text-slate-500 hover:bg-slate-100 hover:text-slate-900`}
            >
              Abmelden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
