"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import type { Lang } from "./data";

interface Store {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("de");

  /* Nach dem Mount aus localStorage lesen, damit Server und Client gleich starten. */
  useEffect(() => {
    try {
      const l = localStorage.getItem("rr.lang");
      if (l === "de" || l === "en") setLangState(l);
    } catch {}
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("rr.lang", l); } catch {}
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore außerhalb des StoreProvider verwendet");
  return s;
}
