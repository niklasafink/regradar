/* DataFast Custom Goals, siehe https://datafa.st/docs — Namen: lowercase, max. 64 Zeichen */

import { hasAnalyticsConsent } from "@/components/cookie-consent";

type DataFastFn = ((goal: string, params?: Record<string, string>) => void) & {
  q?: unknown[];
};

declare global {
  interface Window {
    datafast?: DataFastFn;
  }
}

export function track(goal: string, params?: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.datafast?.(goal, params);
}

/* Verknüpft den Besucher mit einer persistenten ID (E-Mail), damit die
   Journey im DataFast-Dashboard suchbar ist. Personenbezogenes Datum:
   läuft nur bei aktueller Analyse-Einwilligung — ohne Consent landet die
   E-Mail auch nicht in der Queue (die würde bei späterer Einwilligung
   nachträglich gesendet). */
export function identify(userId: string, params?: Record<string, string>) {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  window.datafast?.("identify", { user_id: userId, ...params });
}
