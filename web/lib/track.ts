/* DataFast Custom Goals, siehe https://datafa.st/docs — Namen: lowercase, max. 64 Zeichen */

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

/* Verknüpft den anonymen Besucher mit einer persistenten ID (E-Mail),
   damit die Journey im DataFast-Dashboard suchbar ist. Achtung:
   personenbezogenes Datum — Datenschutzerklärung muss das abdecken. */
export function identify(userId: string, params?: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.datafast?.("identify", { user_id: userId, ...params });
}
