"use client";

import { useEffect, useState } from "react";
import { PROVIDERS } from "@/lib/data";
import { PROVIDER_SHORT, tx } from "@/lib/logic";
import { useStore } from "@/lib/store";
import { grantAnalyticsConsent } from "@/components/cookie-consent";
import { identify, track } from "@/lib/track";

type Status = "idle" | "sending" | "sent" | "confirmed" | "unsubscribed" | "error";

type ErrorCode =
  | "invalid_email"
  | "no_provider"
  | "send_failed"
  | "network"
  | "link_invalid"
  | "unknown";

const ERROR_TEXT: Record<ErrorCode, { de: string; en: string }> = {
  invalid_email: {
    de: "Diese E-Mail-Adresse scheint ungültig zu sein. Bitte prüfen Sie die Eingabe.",
    en: "This email address seems to be invalid. Please check your input.",
  },
  no_provider: {
    de: "Bitte wählen Sie mindestens einen Anbietertyp aus.",
    en: "Please select at least one provider type.",
  },
  send_failed: {
    de: "Die Bestätigungs-E-Mail konnte nicht versendet werden. Bitte versuchen Sie es in ein paar Minuten erneut.",
    en: "The confirmation email could not be sent. Please try again in a few minutes.",
  },
  network: {
    de: "Der Server ist gerade nicht erreichbar. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
    en: "The server is currently unreachable. Please check your internet connection and try again.",
  },
  link_invalid: {
    de: "Dieser Bestätigungslink ist ungültig oder abgelaufen. Bitte melden Sie sich erneut an.",
    en: "This confirmation link is invalid or has expired. Please sign up again.",
  },
  unknown: {
    de: "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.",
    en: "That didn't work. Please try again.",
  },
};

type Frequency = "daily" | "weekly";

export function SubscribeBox({ provider = "" }: { provider?: string }) {
  const { lang } = useStore();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>(
    PROVIDERS.some((p) => p.id === provider) ? [provider] : [],
  );
  const [freq, setFreq] = useState<Frequency>("daily");
  const [status, setStatus] = useState<Status>("idle");
  const [errorCode, setErrorCode] = useState<ErrorCode>("unknown");
  const [hint, setHint] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const abo = new URLSearchParams(window.location.search).get("abo");
    if (abo === "ok") setStatus("confirmed");
    if (abo === "off") setStatus("unsubscribed");
    if (abo === "invalid") {
      setErrorCode("link_invalid");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modalOpen]);

  const toggle = (id: string) => {
    setHint(false);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const send = async (providers: string[]) => {
    setStatus("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, providers, frequency: freq }),
      });
      if (res.ok) {
        // Der Abonnieren-Klick gilt (per Hinweis unterm Formular) als Analyse-
        // Einwilligung — erst erteilen, dann identify (Guard liest den Consent).
        grantAnalyticsConsent();
        identify(email.trim().toLowerCase(), { source: "newsletter" });
        track("newsletter_submitted", {
          provider: providers.join(","),
          frequency: freq,
        });
        setStatus("sent");
        setModalOpen(false);
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      const code = data?.error;
      setErrorCode(
        code === "invalid_email" || code === "no_provider" || code === "send_failed"
          ? code
          : "unknown",
      );
      setStatus("error");
    } catch {
      setErrorCode("network");
      setStatus("error");
    }
  };

  // Immer erst das Dialog-Fenster: dort werden Anbietertyp (falls noch offen)
  // und der Benachrichtigungs-Rhythmus gewählt, dann erst wird abgeschickt.
  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setHint(false);
    setModalOpen(true);
  };

  const confirmModal = () => {
    if (selected.length === 0) {
      setHint(true);
      return;
    }
    void send(selected);
  };

  const body = (
    <>
      {status === "confirmed" ? (
        <p className="mt-4 text-sm font-medium text-slate-900">
          {lang === "de"
            ? "✓ E-Mail bestätigt — Sie erhalten ab jetzt Benachrichtigungen."
            : "✓ Email confirmed — you'll receive notifications from now on."}
        </p>
      ) : status === "unsubscribed" ? (
        <p className="mt-4 text-sm font-medium text-slate-900">
          {lang === "de"
            ? "Sie sind abgemeldet und erhalten keine weiteren E-Mails."
            : "You are unsubscribed and won't receive further emails."}
        </p>
      ) : status === "sent" ? (
        <div className="mx-auto mt-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-9 items-center justify-center rounded-full bg-slate-900 text-sm text-white"
          >
            ✓
          </span>
          <p className="mt-3 text-sm font-medium text-slate-900">
            {lang === "de"
              ? "Bitte bestätigen Sie Ihre E-Mail-Adresse."
              : "Please confirm your email address."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {lang === "de" ? (
              <>
                Wir haben einen Bestätigungslink an{" "}
                <span className="font-medium text-slate-900">{email.trim()}</span>{" "}
                geschickt. Erst nach dem Klick sind Sie angemeldet.
              </>
            ) : (
              <>
                We sent a confirmation link to{" "}
                <span className="font-medium text-slate-900">{email.trim()}</span>.
                You are only subscribed once you click it.
              </>
            )}
          </p>
        </div>
      ) : (
        <form onSubmit={submitEmail} className="mt-4 w-full">
          <div className="mx-auto flex w-full max-w-md gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={lang === "de" ? "name@unternehmen.de" : "name@company.com"}
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-slate-900"
            />
            <button
              type="submit"
              data-fast-goal="newsletter_click"
              data-fast-goal-placement="form"
              disabled={status === "sending"}
              className="shrink-0 rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {status === "sending"
                ? lang === "de" ? "Sendet…" : "Sending…"
                : lang === "de" ? "Abonnieren" : "Subscribe"}
            </button>
          </div>
          {/* volle Breite, damit der einzeilige Text nicht an der max-w-md-Box hängt (Overflow wäre rechtslastig) */}
          <p className="mt-2 w-full text-center text-xs text-slate-400 sm:whitespace-nowrap">
            {lang === "de" ? (
              <>
                Mit dem Abonnieren stimmen Sie der Verwendung von Analyse-Cookies zu (
                <a href="/datenschutz" className="underline underline-offset-2 hover:text-slate-900">
                  Datenschutzerklärung
                </a>
                ).
              </>
            ) : (
              <>
                By subscribing you agree to the use of analytics cookies (
                <a href="/datenschutz" className="underline underline-offset-2 hover:text-slate-900">
                  privacy policy
                </a>
                ).
              </>
            )}
          </p>
        </form>
      )}

      {status === "error" && !modalOpen && (
        <p className="mt-3 text-sm text-red-600">
          {ERROR_TEXT[errorCode][lang === "de" ? "de" : "en"]}
        </p>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              lang === "de" ? "Newsletter einrichten" : "Set up newsletter"
            }
            className="relative w-full max-w-lg rounded-3xl bg-white p-6 text-left shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label={lang === "de" ? "Schließen" : "Close"}
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              ✕
            </button>

            <p className="text-base font-semibold text-slate-900">
              regulatory<em className="font-light">radar</em>
            </p>
            <h2 className="font-heading mt-4 text-xl font-medium tracking-tight text-slate-900 sm:text-2xl">
              {lang === "de" ? "Fast geschafft" : "Almost there"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {lang === "de" ? (
                <>
                  Updates gehen an <span className="font-medium text-slate-900">{email.trim()}</span> — noch zwei kurze Fragen.
                </>
              ) : (
                <>
                  Updates will go to <span className="font-medium text-slate-900">{email.trim()}</span> — two quick questions.
                </>
              )}
            </p>

            <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-400">
              {lang === "de" ? "Für welche Art von Institut?" : "Which type of institution?"}
            </p>
            <div
              className="mt-2.5 flex flex-wrap gap-1.5"
              role="group"
              aria-label={lang === "de" ? "Anbietertyp wählen" : "Choose provider type"}
            >
              {PROVIDERS.map((p) => {
                const active = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(p.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {tx(lang, PROVIDER_SHORT[p.id] ?? p.n)}
                  </button>
                );
              })}
            </div>
            {hint && (
              <p className="mt-2 text-xs text-red-600">
                {lang === "de"
                  ? "Bitte wählen Sie mindestens einen Anbietertyp."
                  : "Please select at least one provider type."}
              </p>
            )}

            <p className="mt-6 text-xs font-medium uppercase tracking-wide text-slate-400">
              {lang === "de" ? "Wie oft möchten Sie Post?" : "How often do you want mail?"}
            </p>
            <div
              className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label={lang === "de" ? "Häufigkeit wählen" : "Choose frequency"}
            >
              {(
                [
                  {
                    id: "daily" as const,
                    title: { de: "Täglich", en: "Daily" },
                    sub: {
                      de: "sofern es neue Updates gibt",
                      en: "whenever there are new updates",
                    },
                  },
                  {
                    id: "weekly" as const,
                    title: { de: "Wöchentlich", en: "Weekly" },
                    sub: {
                      de: "eine gesammelte Übersicht pro Woche",
                      en: "one combined digest per week",
                    },
                  },
                ]
              ).map((opt) => {
                const active = freq === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFreq(opt.id)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      active
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        {opt.title[lang === "de" ? "de" : "en"]}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex size-5 items-center justify-center rounded-full text-[11px] ${
                          active
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {opt.sub[lang === "de" ? "de" : "en"]}
                    </span>
                  </button>
                );
              })}
            </div>

            {status === "error" && (
              <p className="mt-4 text-xs text-red-600">
                {ERROR_TEXT[errorCode][lang === "de" ? "de" : "en"]}
              </p>
            )}

            <button
              type="button"
              onClick={confirmModal}
              disabled={status === "sending"}
              className="mt-7 w-full rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {status === "sending"
                ? lang === "de" ? "Sendet…" : "Sending…"
                : lang === "de" ? "Kostenlos abonnieren →" : "Subscribe for free →"}
            </button>
            <p className="mt-3 text-center text-xs text-slate-400">
              {lang === "de"
                ? "Bestätigung per E-Mail, Abmeldung jederzeit mit einem Klick."
                : "Confirmation by email, unsubscribe anytime with one click."}
            </p>
            <p className="mt-1.5 text-center text-[11px] text-slate-400">
              {lang === "de" ? (
                <>
                  Mit dem Abonnieren stimmen Sie der Verwendung von Analyse-Cookies zu (
                  <a
                    href="/datenschutz"
                    className="underline underline-offset-2 hover:text-slate-900"
                  >
                    Datenschutzerklärung
                  </a>
                  ).
                </>
              ) : (
                <>
                  By subscribing you agree to the use of analytics cookies (
                  <a
                    href="/datenschutz"
                    className="underline underline-offset-2 hover:text-slate-900"
                  >
                    privacy policy
                  </a>
                  ).
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div id="newsletter" className="mx-auto mt-7 scroll-mt-24 text-center">
      {body}
    </div>
  );
}
