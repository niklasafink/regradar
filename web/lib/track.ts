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
