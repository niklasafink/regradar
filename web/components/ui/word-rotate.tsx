"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 600;
const EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

/** Wechselt in einer Textzeile zwischen mehreren Wörtern (z. B. „Montag“ und
    „Tag“). Die Breite gleitet mit, damit der Rest der Zeile nicht springt.
    Im Server-HTML steht nur das erste Wort, die übrigen kommen nach dem Laden
    dazu. Ohne Abhängigkeit; die Keyframes rr-word-in/-out stehen in globals.css. */
export function WordRotate({ words, interval = 2800 }: { words: string[]; interval?: number }) {
  const [ticks, setTicks] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [widths, setWidths] = useState<number[]>([]);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTicks((i) => i + 1), interval);
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

  const flipped = mounted && ticks > 0;
  const active = ticks % words.length;
  const previous = (ticks - 1 + words.length) % words.length;
  const width = widths[active];
  return (
    <span
      className="relative inline-block whitespace-nowrap transition-[width] duration-[600ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"
      style={width ? { width } : undefined}
    >
      {(mounted ? words : words.slice(0, 1)).map((word, k) => (
        <span
          key={word}
          ref={(el) => {
            refs.current[k] = el;
          }}
          aria-hidden={k !== active}
          className={`${k === 0 ? "inline-block" : "absolute top-0 left-0"}`}
          style={{
            opacity: k === active ? 1 : 0,
            // Vor dem ersten Wechsel steht das Wort still; danach kippt das alte
            // nach oben weg und das neue dreht sich von unten herein.
            animation: !flipped
              ? undefined
              : k === active
                ? `rr-word-in ${DURATION}ms ${EASING} both`
                : k === previous
                  ? `rr-word-out ${DURATION}ms ${EASING} both`
                  : undefined,
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
