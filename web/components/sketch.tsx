"use client";

import { useEffect, useRef } from "react";

/* Zeichnet die Formen einer Server-SVG im Strich-Look nach (rough.js).
   Formen mit der Klasse "sk" werden ersetzt, Texte bleiben echtes SVG-<text>
   und damit für Suchmaschinen lesbar. Ohne JavaScript bleiben glatte Formen. */
export function Sketch({ seed, children }: { seed: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svg = ref.current?.querySelector("svg");
      if (!svg || svg.dataset.sketched) return;
      const rough = (await import("roughjs")).default;
      if (cancelled) return;
      svg.dataset.sketched = "1";
      const rc = rough.svg(svg);
      let i = 0;
      const nums = (s: string) => (s.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      svg.querySelectorAll<SVGElement>(".sk").forEach((el) => {
        i += 1;
        const a = (k: string) => parseFloat(el.getAttribute(k) || "0");
        const o: Record<string, unknown> = {
          stroke: "currentColor",
          strokeWidth: parseFloat(el.getAttribute("data-w") || "1.6"),
          roughness: 1.1,
          bowing: 1,
          seed: seed * 100 + i,
        };
        if (el.hasAttribute("data-fill")) Object.assign(o, { fill: "currentColor", fillStyle: "hachure", hachureGap: 9, fillWeight: 0.8, hachureAngle: -41 });
        const t = el.tagName.toLowerCase();
        let n: SVGGElement | null = null;
        if (t === "rect") n = rc.rectangle(a("x"), a("y"), a("width"), a("height"), o);
        else if (t === "circle") n = rc.circle(a("cx"), a("cy"), 2 * a("r"), o);
        else if (t === "path") n = rc.path(el.getAttribute("d") || "", o);
        if (!n) return;
        const cls = (el.getAttribute("class") || "").replace(/\b(sk|arrow)\b/g, "").trim();
        const place = (node: SVGGElement) => {
          if (cls) node.setAttribute("class", cls);
          el.parentNode?.insertBefore(node, el);
        };
        place(n);
        if (el.classList.contains("arrow")) {
          const p = nums(el.getAttribute("d") || "");
          const L = p.length;
          const [px, py, ex, ey] = [p[L - 4], p[L - 3], p[L - 2], p[L - 1]];
          const ang = Math.atan2(ey - py, ex - px);
          for (const d of [0.45, -0.45]) {
            i += 1;
            place(rc.line(ex, ey, ex - 14 * Math.cos(ang + d), ey - 14 * Math.sin(ang + d),
              { stroke: "currentColor", strokeWidth: o.strokeWidth as number, roughness: 0.8, seed: seed * 100 + i }));
          }
        }
        el.remove();
      });
      svg.querySelectorAll<SVGGElement>("g.fig").forEach((g) => {
        const x = parseFloat(g.dataset.x || "0");
        const y = parseFloat(g.dataset.y || "0");
        const s = { stroke: "currentColor", strokeWidth: 1.8, roughness: 0.9 };
        const next = () => ({ ...s, seed: seed * 100 + ++i });
        [
          rc.circle(x, y - 52, 18, next()),
          rc.line(x, y - 43, x, y - 18, next()),
          rc.line(x, y - 18, x - 10, y, next()),
          rc.line(x, y - 18, x + 10, y, next()),
          rc.line(x - 15, y - 30, x, y - 36, next()),
          rc.line(x, y - 36, x + 14, y - 46, next()),
        ].forEach((p) => g.appendChild(p));
      });
    })().catch(() => {
      /* Ohne rough.js bleiben die glatten Formen stehen. */
    });
    return () => {
      cancelled = true;
    };
  }, [seed]);

  return (
    <div ref={ref} className="overflow-x-auto rounded-2xl border border-slate-200 p-3">
      {children}
    </div>
  );
}
