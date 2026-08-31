"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

/**
 * Cookie-/Consent-Banner nach Vorbild vergabehero.eu (Karte unten rechts).
 *
 * Notwendige Technik (Hosting, Sprachwahl) läuft immer; DataFast ist cookielos
 * und braucht keine Einwilligung. Google Analytics wird erst nach Einwilligung
 * geladen — und nur, wenn NEXT_PUBLIC_GA_ID gesetzt ist.
 */

const STORAGE_KEY = "rr.consent";
const OPEN_EVENT = "rr-consent-open";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

type Consent = { v: 1; analytics: boolean; ts: string };

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    return typeof c?.analytics === "boolean" ? c : null;
  } catch {
    return null;
  }
}

function writeConsent(analytics: boolean): Consent {
  const c: Consent = { v: 1, analytics, ts: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {}
  return c;
}

let gaLoaded = false;

function loadGoogleAnalytics() {
  if (!GA_ID || gaLoaded || typeof document === "undefined") return;
  gaLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  const inline = document.createElement("script");
  inline.textContent = [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js',new Date());",
    `gtag('config','${GA_ID}',{anonymize_ip:true});`,
  ].join("");
  document.head.appendChild(inline);
}

/** Öffnet den Banner erneut, z. B. aus Footer oder Datenschutzerklärung. */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Text-Link „Cookie-Einstellungen", der den Banner wieder öffnet. */
export function ConsentSettingsLink({ className = "" }: { className?: string }) {
  const { lang } = useStore();
  return (
    <button
      type="button"
      onClick={openConsentSettings}
      className={`hover:text-slate-900 ${className}`}
    >
      {lang === "de" ? "Cookie-Einstellungen" : "Cookie settings"}
    </button>
  );
}

export function CookieConsent() {
  const { lang } = useStore();
  const de = lang === "de";
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const stored = readConsent();
    if (!stored) {
      setVisible(true);
    } else if (stored.analytics) {
      loadGoogleAnalytics();
    }
    const open = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setSettings(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  const decide = (allowAnalytics: boolean) => {
    writeConsent(allowAnalytics);
    if (allowAnalytics) loadGoogleAnalytics();
    setVisible(false);
    setSettings(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={de ? "Datenschutzeinstellungen" : "Privacy settings"}
      className="fixed bottom-4 right-4 left-4 z-50 max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:left-auto"
    >
      <p className="text-sm font-medium text-slate-900">
        {de ? "Datenschutzeinstellungen" : "Privacy settings"}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
        {de
          ? "Wir verwenden Cookies, um die Grundfunktionen der Website sicherzustellen. Mit Ihrer Einwilligung setzen wir zusätzlich Analyse-Cookies, um die Nutzung auszuwerten und unser Angebot zu verbessern."
          : "We use cookies to ensure the basic functions of this website. With your consent, we also set analytics cookies to evaluate usage and improve our service."}
      </p>

      {settings && (
        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-2.5 text-[13px] text-slate-600">
            <input type="checkbox" checked disabled className="mt-0.5 accent-slate-900" />
            <span>
              <span className="font-medium text-slate-900">
                {de ? "Notwendig" : "Necessary"}
              </span>
              {" — "}
              {de
                ? "Grundfunktionen wie Sprachwahl und das Speichern dieser Einstellung. Immer aktiv."
                : "Basic functions such as language choice and saving this setting. Always active."}
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              className="mt-0.5 accent-slate-900"
            />
            <span>
              <span className="font-medium text-slate-900">
                {de ? "Analyse" : "Analytics"}
              </span>
              {" — "}
              {de
                ? "Google Analytics zur Reichweitenmessung. Zusätzlich nutzen wir DataFast, das ohne Cookies auskommt."
                : "Google Analytics for reach measurement. We also use DataFast, which works without cookies."}
            </span>
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => decide(true)}
          className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          {de ? "Alle akzeptieren" : "Accept all"}
        </button>
        {settings ? (
          <button
            type="button"
            onClick={() => decide(analytics)}
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
          >
            {de ? "Auswahl speichern" : "Save selection"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide(false)}
              className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
            >
              {de ? "Nur notwendige" : "Necessary only"}
            </button>
            <button
              type="button"
              onClick={() => setSettings(true)}
              className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
            >
              {de ? "Einstellungen" : "Settings"}
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 flex gap-3 text-xs text-slate-400">
        <Link href="/datenschutz" className="hover:text-slate-900">
          {de ? "Datenschutzerklärung" : "Privacy policy"}
        </Link>
        <Link href="/impressum" className="hover:text-slate-900">
          {de ? "Impressum" : "Legal notice"}
        </Link>
      </p>
    </div>
  );
}
