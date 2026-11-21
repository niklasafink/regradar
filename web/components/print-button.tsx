"use client";

import { useEffect } from "react";

/** PDF-Export über den Druckdialog des Browsers („Als PDF speichern“). Klappbare Details werden dafür geöffnet. */
export function PrintButton({ className }: { className?: string }) {
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const before = () => {
      document.querySelectorAll<HTMLDetailsElement>("article details:not([open])").forEach((d) => {
        d.open = true;
        opened.push(d);
      });
    };
    const after = () => {
      opened.splice(0).forEach((d) => { d.open = false; });
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return (
    <button type="button" onClick={() => window.print()} className={className}>
      Als PDF exportieren
    </button>
  );
}
