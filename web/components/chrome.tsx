"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConsentSettingsLink } from "@/components/cookie-consent";
import { PROVIDERS } from "@/lib/data";
import { providerById, tx } from "@/lib/logic";
import { SOURCES } from "@/lib/sources";
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
                href={`/r/${p.slug}`}
                data-fast-goal="institute_selected"
                data-fast-goal-institute={p.id}
                data-fast-goal-source="menu"
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

/** Dropdown "Fristen & Praxis" im Hauptmenü — Auswahl zwischen offenen
    Fristen und Aufsichtspraxis-Meldungen, gleiche Mechanik wie ProviderMenu. */
function DeadlinesPraxisMenu() {
  const { lang } = useStore();
  const pathname = usePathname();
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

  const items = [
    { href: "/fristen", label: lang === "de" ? "Fristen" : "Deadlines" },
    { href: "/praxis", label: lang === "de" ? "Praxis" : "Enforcement" },
  ];
  const active = items.find((i) => i.href === pathname);

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
        {active
          ? active.label
          : lang === "de" ? "Fristen & Praxis" : "Deadlines & enforcement"}
        <svg
          aria-hidden
          viewBox="0 0 256 256"
          fill="currentColor"
          className={`relative top-px size-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-40 -translate-x-1/2 pt-2">
          <div
            role="menu"
            className="w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl"
          >
            {items.map((i) => (
              <Link
                key={i.href}
                role="menuitem"
                href={i.href}
                data-fast-goal="nav_click"
                data-fast-goal-page={i.href.slice(1)}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-3 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  pathname === i.href
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {i.label}
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
          className="h-6 w-6 rounded-full object-cover ring-2 ring-slate-700"
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
      <div
        className="bg-slate-800 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/webinar-bar-bg.jpg)" }}
      >
        <Link
          href="/#newsletter"
          data-fast-goal="newsletter_click"
          data-fast-goal-placement="banner"
          className="group mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-2.5 text-sm sm:px-6"
        >
          <BannerAvatars />
          <span className="truncate text-white/75">
            {lang === "de"
              ? "Regulatory Radar ist kostenlos, ohne Anmeldung und ohne Paywall."
              : "Regulatory Radar is free, with no sign-up and no paywall."}
          </span>
          <span className="hidden shrink-0 font-medium text-white group-hover:underline sm:inline">
            {lang === "de"
              ? "Newsletter abonnieren →"
              : "Subscribe to the newsletter →"}
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
              data-fast-goal="nav_click"
              data-fast-goal-page="home"
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                pathname === "/"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {lang === "de" ? "Start" : "Home"}
            </Link>
            <ProviderMenu />
            <DeadlinesPraxisMenu />
            <Link
              href="/updates"
              data-fast-goal="nav_click"
              data-fast-goal-page="updates"
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
          <a
            href="https://github.com/niklasafink/regradar"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            title="GitHub"
            data-fast-goal="github_click"
            className="hidden shrink-0 text-slate-400 transition-colors hover:text-slate-900 sm:inline-flex"
          >
            {/* GitHub-Mark */}
            <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-4">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <LangSwitch />
          <Link
            href="/#newsletter"
            data-fast-goal="newsletter_click"
            data-fast-goal-placement="header"
            className="hidden shrink-0 items-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 sm:inline-flex"
          >
            {lang === "de" ? "Newsletter abonnieren" : "Subscribe to newsletter"}
          </Link>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  const { lang } = useStore();
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-slate-900">
              {lang === "de" ? "Angebundene Quellen" : "Connected sources"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              {SOURCES.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && <span aria-hidden> · </span>}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-fast-goal="source_click"
                    data-fast-goal-source={s.id}
                    data-fast-goal-placement="footer"
                    className="hover:text-slate-900"
                  >
                    {s.name}
                  </a>
                </span>
              ))}
            </p>
          </div>
          <Link
            href="/quellen"
            data-fast-goal="footer_link_click"
            data-fast-goal-page="quellen"
            className="inline-flex shrink-0 items-center rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
          >
            {lang === "de"
              ? `Alle ${SOURCES.length} Quellen im Detail →`
              : `All ${SOURCES.length} sources in detail →`}
          </Link>
        </div>
        <div className="mt-12 border-t border-slate-100 pt-6">
          <p className="text-xs leading-relaxed text-slate-400">
            {lang === "de"
              ? "Die Inhalte auf dieser Website wurden mit Unterstützung von KI zusammengefasst. Fehler können nicht ausgeschlossen werden. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte übernehmen wir als Websiteanbieter keine Haftung."
              : "The content on this website has been summarized with the help of AI. Errors cannot be ruled out. As the website provider, we accept no liability for the accuracy, completeness, or timeliness of the content."}
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} Regulatory Radar.{" "}
            {lang === "de"
              ? "Keine Rechtsberatung und keine regulatorische Auskunft."
              : "Not legal advice and not regulatory guidance."}
          </span>
          <span className="flex gap-4">
            <Link
              href="/quellen"
              data-fast-goal="footer_link_click"
              data-fast-goal-page="quellen"
              className="hover:text-slate-900"
            >
              {lang === "de" ? "Quellen" : "Sources"}
            </Link>
            <Link
              href="/datenschutz"
              data-fast-goal="footer_link_click"
              data-fast-goal-page="datenschutz"
              className="hover:text-slate-900"
            >
              {lang === "de" ? "Datenschutz" : "Privacy"}
            </Link>
            <Link
              href="/impressum"
              data-fast-goal="footer_link_click"
              data-fast-goal-page="impressum"
              className="hover:text-slate-900"
            >
              {lang === "de" ? "Impressum" : "Legal notice"}
            </Link>
            <ConsentSettingsLink />
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
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <p className="text-xs leading-relaxed text-slate-400">
          {lang === "de"
            ? "Die Inhalte auf dieser Website wurden mit Unterstützung von KI zusammengefasst. Fehler können nicht ausgeschlossen werden. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte übernehmen wir als Websiteanbieter keine Haftung."
            : "The content on this website has been summarized with the help of AI. Errors cannot be ruled out. As the website provider, we accept no liability for the accuracy, completeness, or timeliness of the content."}
        </p>
        <div className="mt-3 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {new Date().getFullYear()} Regulatory Radar.{" "}
          {lang === "de"
            ? "Keine Rechtsberatung und keine regulatorische Auskunft."
            : "Not legal advice and not regulatory guidance."}
        </span>
        <span className="flex gap-4">
          <Link
            href="/quellen"
            data-fast-goal="footer_link_click"
            data-fast-goal-page="quellen"
            className="hover:text-slate-900"
          >
            {lang === "de" ? "Quellen" : "Sources"}
          </Link>
          <Link
            href="/datenschutz"
            data-fast-goal="footer_link_click"
            data-fast-goal-page="datenschutz"
            className="hover:text-slate-900"
          >
            {lang === "de" ? "Datenschutz" : "Privacy"}
          </Link>
          <Link
            href="/impressum"
            data-fast-goal="footer_link_click"
            data-fast-goal-page="impressum"
            className="hover:text-slate-900"
          >
            {lang === "de" ? "Impressum" : "Legal notice"}
          </Link>
          <ConsentSettingsLink />
        </span>
        </div>
      </div>
    </footer>
  );
}
