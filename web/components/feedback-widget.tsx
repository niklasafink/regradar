"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { hasConsentDecision } from "@/components/cookie-consent";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";

/**
 * Kleines Feedback-Fenster unten rechts (nicht auf der Startseite): erscheint
 * 3 s nach dem Seitenaufruf, sobald der Cookie-Banner entschieden ist, damit
 * sich beide nicht überlagern. Schritt 1: Freitext, Schritt 2: E-Mail, dann
 * Versand an /api/feedback (Mail an den Betreiber, Reply-To = Nutzer).
 * Standard ist die kleine Form: Foto plus Sprechblase „Fehlt dir etwas?“.
 * Das X klappt das geöffnete Fenster wieder zusammen und blendet die
 * Sprechblase bis zum nächsten Seitenaufruf aus. Nichts wird gespeichert:
 * nach einem Neuladen erscheint die kleine Form wieder, auch nach dem Versand.
 */

const SHOW_DELAY_MS = 3000;


function Avatar({ size }: { size: number }) {
  return (
    <Image
      src="/images/niklas.jpg"
      alt="Niklas Fink"
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const { lang } = useStore();
  const de = lang === "de";

  const [ready, setReady] = useState(false); // 3 s abgelaufen + Consent entschieden
  const [minimized, setMinimized] = useState(true);
  const [dismissed, setDismissed] = useState(false); // per X geschlossen → bis zur nächsten Seite ohne Sprechblase
  const [gone, setGone] = useState(false);
  const [step, setStep] = useState<"message" | "email" | "sent">("message");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer = setTimeout(() => setReady(true), SHOW_DELAY_MS);
    };
    if (hasConsentDecision()) {
      start();
    } else {
      poll = setInterval(() => {
        if (hasConsentDecision()) {
          clearInterval(poll);
          start();
        }
      }, 500);
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
    };
  }, []);

  if (pathname === "/" || gone || !ready) return null;

  const minimize = () => {
    setMinimized(true);
    setDismissed(true);
  };
  const open = () => setMinimized(false);

  const submit = async () => {
    setError(null);
    if (step === "message") {
      if (!message.trim()) return;
      setStep("email");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, email, page: pathname }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          data.error === "invalid_email"
            ? de
              ? "Bitte eine gültige E-Mail-Adresse angeben."
              : "Please enter a valid email address."
            : de
              ? "Senden fehlgeschlagen, bitte später erneut versuchen."
              : "Sending failed, please try again later.",
        );
        return;
      }
      track("feedback_sent", { page: pathname });
      setStep("sent");
    } catch {
      setError(de ? "Senden fehlgeschlagen, bitte später erneut versuchen." : "Sending failed, please try again later.");
    } finally {
      setBusy(false);
    }
  };

  if (minimized) {
    return (
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-40 flex items-center gap-1.5 animate-[rr-pop-in_.5s_cubic-bezier(.16,1,.3,1)_both] sm:right-4 sm:gap-2">
        <button
          type="button"
          onClick={() => setGone(true)}
          aria-label={de ? "Ausblenden" : "Hide"}
          className="flex size-6 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition-colors hover:text-slate-900"
        >
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
        <button
          type="button"
          onClick={open}
          aria-label={de ? "Fehlt dir etwas? Feedback geben" : "Missing something? Give feedback"}
          className="group flex items-center gap-1.5 sm:gap-2"
        >
          {!dismissed && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-900 shadow-md transition-colors group-hover:border-slate-900 sm:px-3.5 sm:py-2 sm:text-sm">
              {de ? "Fehlt dir etwas?" : "Missing something?"}
            </span>
          )}
          <span className="relative rounded-full bg-white p-0.5 shadow-md ring-1 ring-slate-200 transition-transform group-hover:scale-105">
            <span className="block sm:hidden">
              <Avatar size={36} />
            </span>
            <span className="hidden sm:block">
              <Avatar size={44} />
            </span>
            <span
              className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-white ring-2 ring-white"
              style={{ background: "linear-gradient(135deg,#1e1b4b,#3b82f6)" }}
            >
              ?
            </span>
          </span>
        </button>
      </div>
    );
  }

  const input =
    "w-full border border-transparent bg-white text-base text-slate-900 sm:text-sm placeholder:text-slate-400 shadow-sm focus:border-slate-300 focus:outline-none";

  return (
    <div
      role="dialog"
      aria-label="Feedback"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-40 w-[calc(100vw-1.5rem)] max-w-[18rem] rounded-[22px] bg-white p-1.5 shadow-lg ring-1 ring-slate-200 animate-[rr-pop-in_.4s_cubic-bezier(.16,1,.3,1)_both] sm:bottom-4 sm:right-4"
    >
      {/* Farbiger Kopf mit weichem Lichtschein, Foto überlappt die Kante */}
      <div
        className="relative h-14 overflow-hidden rounded-t-[16px] sm:h-16"
        style={{
          background:
            "radial-gradient(120% 90% at 85% 120%, rgba(255,255,255,0.95) 0%, rgba(147,197,253,0.9) 22%, rgba(59,130,246,0.55) 42%, rgba(30,27,75,0) 70%), linear-gradient(120deg,#0b1020 0%,#1e1b4b 60%,#312e81 100%)",
        }}
      >
        <button
          type="button"
          onClick={step === "sent" ? () => setGone(true) : minimize}
          aria-label={de ? "Schließen" : "Close"}
          className="absolute left-2.5 top-2.5 flex size-6 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">×</span>
        </button>
      </div>

      <div className="relative rounded-b-[16px] bg-slate-100 px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 sm:pt-4">
        <div className="absolute -top-6 right-3.5 rounded-full bg-slate-100 p-1 sm:-top-7 sm:right-4">
          <span className="block sm:hidden"><Avatar size={48} /></span>
          <span className="hidden sm:block"><Avatar size={56} /></span>
        </div>

        <p className="pr-16 text-[15px] tracking-tight text-slate-900">
          <span className="font-extrabold">regulatory</span>
          <span className="font-wordmark italic">radar</span>
          <span className="font-medium text-slate-500">
            {step === "sent" ? (de ? " – Danke!" : " – Thanks!") : " – Feedback"}
          </span>
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          {step === "sent"
            ? de
              ? "Danke! Bei Bedarf melde ich mich bei dir."
              : "Thanks! I'll get in touch if needed."
            : step === "email"
              ? de
                ? "Ihre Nachricht geht direkt an mich. Wohin darf ich antworten?"
                : "Your message goes straight to me. Where can I reply?"
              : de
                ? "Ich bin Niklas und baue RegRadar. Fehlt eine Quelle, ein Rahmenwerk oder eine Funktion?"
                : "I'm Niklas and I'm building RegRadar. Is a source, a framework or a feature missing?"}
        </p>

        {step !== "sent" && (
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {step === "message" ? (
              <textarea
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder={de ? "Was fehlt, was könnte besser sein?" : "What's missing, what could be better?"}
                className={`${input} resize-none rounded-2xl px-3.5 py-2.5`}
              />
            ) : (
              <>
                <p className="mb-2 line-clamp-2 text-xs italic text-slate-500">„{message}“</p>
                <input
                  autoFocus
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={de ? "Ihre E-Mail-Adresse" : "Your email address"}
                  className={`${input} rounded-full px-4 py-2.5`}
                />
              </>
            )}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex items-center gap-2">
              {step === "email" && (
                <button
                  type="button"
                  onClick={() => setStep("message")}
                  className="rounded-full px-3 py-2 text-sm text-slate-500 transition-colors hover:text-slate-900"
                >
                  {de ? "← Zurück" : "← Back"}
                </button>
              )}
              <button
                type="submit"
                disabled={busy || (step === "message" ? !message.trim() : !email)}
                className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-900"
              >
                {busy
                  ? de ? "Sende …" : "Sending …"
                  : step === "message"
                    ? de ? "Senden" : "Send"
                    : de ? "Abschicken" : "Submit"}
              </button>
            </div>
            {step === "email" && (
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                {de
                  ? "Die E-Mail wird nur für die Antwort genutzt, kein Newsletter."
                  : "Your email is only used for the reply, no newsletter."}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
