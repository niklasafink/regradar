"use client";

import { useEffect } from "react";

/** Meldet den Identify-Token aus Newsletter-Links (?df=…) an /api/df, das die
    E-Mail server-seitig mit dem DataFast-Besucherprofil verknüpft. Danach wird
    der Parameter aus der URL entfernt, damit der Token nicht in Bookmarks,
    geteilten Links oder der Adresszeile hängen bleibt. */
export function DatafastIdentify() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("df");
    if (!token) return;
    url.searchParams.delete("df");
    window.history.replaceState(null, "", url.toString());
    void fetch("/api/df", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }, []);

  return null;
}
