"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

type Status = "idle" | "sending" | "sent" | "confirmed" | "error";

export function SubscribeBox({ provider = "" }: { provider?: string }) {
  const { lang } = useStore();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    const abo = new URLSearchParams(window.location.search).get("abo");
    if (abo === "ok") setStatus("confirmed");
    if (abo === "invalid") setStatus("error");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, provider }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  const body = (
    <>
      {status === "confirmed" ? (
        <p className="mt-4 text-sm font-medium text-slate-900">
          {lang === "de"
            ? "✓ E-Mail bestätigt — Sie erhalten ab jetzt Benachrichtigungen."
            : "✓ Email confirmed — you'll receive notifications from now on."}
        </p>
      ) : status === "sent" ? (
        <p className="mt-4 text-sm font-medium text-slate-900">
          {lang === "de"
            ? "Fast geschafft: Bitte klicken Sie auf den Bestätigungslink, den wir Ihnen gerade geschickt haben."
            : "Almost done: please click the confirmation link we just sent you."}
        </p>
      ) : (
        <form onSubmit={submit} className="mx-auto mt-4 flex w-full max-w-md gap-2">
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
            disabled={status === "sending"}
            className="shrink-0 rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {status === "sending"
              ? lang === "de" ? "Sendet…" : "Sending…"
              : lang === "de" ? "Abonnieren" : "Subscribe"}
          </button>
        </form>
      )}

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">
          {lang === "de"
            ? "Das hat nicht geklappt. Bitte versuchen Sie es erneut."
            : "That didn't work. Please try again."}
        </p>
      )}
    </>
  );

  return (
    <div id="newsletter" className="mx-auto mt-7 max-w-md scroll-mt-24 text-center">
      {body}
    </div>
  );
}
