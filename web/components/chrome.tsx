"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PROVIDERS } from "@/lib/data";
import { FRAMEWORKS, dt, fmtDate, providerById, tx } from "@/lib/logic";
import { useStore } from "@/lib/store";

export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col tracking-tight text-slate-900 ${className}`}>
      <span>
        <span className="font-extrabold">regulatory</span>
        <span className="font-wordmark italic">radar</span>
      </span>
      <span className="-mt-0.5 self-end text-[9px] font-normal not-italic tracking-normal text-slate-400">
        von Conformis
      </span>
    </span>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useStore();
  return (
    <div
      className="inline-flex items-center rounded-full border border-slate-200 p-0.5 text-xs font-medium"
      role="group"
      aria-label="Sprache"
    >
      {(["de", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            lang === l
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Dropdown im Hauptmenü mit allen Zielgruppen (Anbietertypen) */
function ProviderMenu() {
  const { lang } = useStore();
  const params = useParams<{ provider?: string }>();
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

  const active = params.provider ? providerById(params.provider) : undefined;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
          active
            ? "bg-slate-900 text-white"
            : open
              ? "bg-slate-100 text-slate-900"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        {active ? tx(lang, active.n) : lang === "de" ? "Zielgruppen" : "Target groups"}
        {/* Phosphor CaretDown, identisch mit dem Dropdown-Pfeil bei vergabehero.eu */}
        <svg
          aria-hidden
          viewBox="0 0 256 256"
          fill="currentColor"
          className={`relative top-px size-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
        </svg>
      </button>
      {/* pt-2 statt mt-2, damit der Hover beim Übergang zum Menü nicht abreißt */}
      {open && (
        <div className="absolute left-1/2 top-full z-40 -translate-x-1/2 pt-2">
          <div
            role="menu"
            className="w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl"
          >
            {PROVIDERS.map((p) => (
              <Link
                key={p.id}
                role="menuitem"
                href={`/r/${p.id}`}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-3 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  active?.id === p.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {tx(lang, p.n)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Drei überlappende Portraitfotos für das Kostenlos-Banner */
function BannerAvatars() {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-2">
      {[1, 2, 3].map((n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src={`/avatars/avatar-${n}.jpg`}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 rounded-full object-cover ring-2 ring-slate-100"
        />
      ))}
    </span>
  );
}

export function Chrome({ children }: { children?: ReactNode }) {
  const { lang } = useStore();
  const pathname = usePathname();
  return (
    <>
      <div className="border-b border-slate-200 bg-slate-100">
        <Link
          href="/#newsletter"
          className="group mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-2 text-[13px] text-slate-600 sm:px-6"
        >
          <BannerAvatars />
          <span className="truncate">
            {lang === "de"
              ? "Regulatory Radar ist kostenlos, ohne Anmeldung und ohne Paywall."
              : "Regulatory Radar is free, with no sign-up and no paywall."}
          </span>
          <span className="hidden shrink-0 items-center rounded-full bg-slate-900 px-3.5 py-1 text-xs font-medium text-white transition-colors group-hover:bg-slate-700 sm:inline-flex">
            {lang === "de"
              ? "Newsletter abonnieren und auf dem Laufenden bleiben →"
              : "Subscribe to the newsletter to stay up to date →"}
          </span>
        </Link>
      </div>
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex"
            aria-label={lang === "de" ? "Hauptnavigation" : "Main navigation"}
          >
            <Link
              href="/"
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                pathname === "/"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {lang === "de" ? "Start" : "Home"}
            </Link>
            <ProviderMenu />
            <Link
              href="/updates"
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                pathname === "/updates"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {lang === "de" ? "Alle Updates" : "All updates"}
            </Link>
          </nav>
          <span className="flex-1" />
          {children && (
            <span className="hidden items-center gap-3 xl:flex">{children}</span>
          )}
          <LangSwitch />
          <Link
            href="/#newsletter"
            className="hidden shrink-0 items-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 sm:inline-flex"
          >
            {lang === "de" ? "Newsletter abonnieren" : "Subscribe to newsletter"}
          </Link>
        </div>
      </header>
    </>
  );
}

/** Datum des neuesten Updates über alle Rahmenwerke */
const DATA_DATE = FRAMEWORKS.flatMap((f) => f.u).reduce(
  (max, u) => (dt(u.d) > dt(max) ? u.d : max),
  "01.01.1970",
);

export function Footer() {
  const { lang } = useStore();
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Wordmark className="text-lg" />
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              {lang === "de"
                ? "Der kostenlose Regulatory Monitor für Finanzunternehmen. Quelloffen und ohne Anmeldung."
                : "The free regulatory monitor for financial firms. Open source, no sign-up required."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm sm:gap-20">
            <div>
              <p className="font-medium text-slate-900">
                {lang === "de" ? "Produkt" : "Product"}
              </p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li>
                  <Link href="/" className="hover:text-slate-900">
                    {lang === "de" ? "Anbietertypen" : "Provider types"}
                  </Link>
                </li>
                <li>
                  <Link href="/updates" className="hover:text-slate-900">
                    {lang === "de" ? "Alle Updates" : "All updates"}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {lang === "de" ? "Hinweise" : "Notes"}
              </p>
              <ul className="mt-3 space-y-2 text-slate-500">
                <li>{lang === "de" ? "Quelloffen und kostenlos" : "Open source and free"}</li>
                <li>
                  {lang === "de"
                    ? `Datenstand ${fmtDate(lang, DATA_DATE)}`
                    : `Data as of ${fmtDate(lang, DATA_DATE)}`}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-slate-100 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} Regulatory Radar.{" "}
            {lang === "de"
              ? "Keine Rechtsberatung und keine regulatorische Auskunft."
              : "Not legal advice and not regulatory guidance."}
          </span>
          <span className="flex gap-4">
            <Link href="/datenschutz" className="hover:text-slate-900">
              {lang === "de" ? "Datenschutz" : "Privacy"}
            </Link>
            <Link href="/impressum" className="hover:text-slate-900">
              {lang === "de" ? "Impressum" : "Legal notice"}
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Super schmaler Footer für Seiten ohne großen Footer (Start, Rechtliches) */
export function SlimFooter() {
  const { lang } = useStore();
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>
          © {new Date().getFullYear()} Regulatory Radar.{" "}
          {lang === "de"
            ? "Keine Rechtsberatung und keine regulatorische Auskunft."
            : "Not legal advice and not regulatory guidance."}
        </span>
        <span className="flex gap-4">
          <Link href="/datenschutz" className="hover:text-slate-900">
            {lang === "de" ? "Datenschutz" : "Privacy"}
          </Link>
          <Link href="/impressum" className="hover:text-slate-900">
            {lang === "de" ? "Impressum" : "Legal notice"}
          </Link>
        </span>
      </div>
    </footer>
  );
}
