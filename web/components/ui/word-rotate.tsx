"use client";

import { useEffect, useRef, useState } from "react";

/** Wechselt in einer Textzeile zwischen mehreren Wörtern (z. B. „Montag“ und
    „Tag“). Die Breite gleitet mit, damit der Rest der Zeile nicht springt.
    Im Server-HTML steht nur das erste Wort, die übrigen kommen nach dem Laden
    dazu. Ohne Abhängigkeit, nur CSS-Übergänge. */
export function WordRotate({ words, interval = 2800 }: { words: string[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [widths, setWidths] = useState<number[]>([]);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setActive((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  // Wortbreiten messen, auch nach Schriftwechsel und Umbruch der Schriftgröße.
  useEffect(() => {
    if (!mounted) return;
    const measure = () => setWidths(refs.current.map((el) => el?.getBoundingClientRect().width ?? 0));
    measure();
    const ro = new ResizeObserver(measure);
    refs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [mounted, words]);

  const width = widths[active];
  return (
    <span
      className="relative inline-block whitespace-nowrap transition-[width] duration-500 ease-out motion-reduce:transition-none"
      style={width ? { width } : undefined}
    >
      {(mounted ? words : words.slice(0, 1)).map((word, k) => (
        <span
          key={word}
          ref={(el) => {
            refs.current[k] = el;
          }}
          aria-hidden={k !== active}
          className={`${k === 0 ? "inline-block" : "absolute top-0 left-0"} transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none`}
          style={{
            opacity: k === active ? 1 : 0,
            transform: k === active ? "none" : `translateY(${k < active || (active === 0 && k === words.length - 1 && words.length > 2) ? "-0.35em" : "0.35em"})`,
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
