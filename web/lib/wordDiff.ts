// Wortweiser Vergleich zweier Texte (LCS) für die Änderungsverfolgung im
// Fassungsvergleich. Reine Funktion, läuft im Browser; die Texte sind kurze
// Normauszüge (höchstens einige hundert Zeichen).

export type DiffSeg = { k: "eq" | "del" | "ins"; x: string };

const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

export function wordDiff(a: string, b: string): DiffSeg[] {
  const A = tokens(a), B = tokens(b);
  const n = A.length, m = B.length;
  // dp[i][j] = Länge der längsten gemeinsamen Teilfolge von A[i..] und B[j..]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: DiffSeg[] = [];
  const push = (k: DiffSeg["k"], x: string) => {
    const last = out[out.length - 1];
    if (last && last.k === k) last.x += x;
    else out.push({ k, x });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("eq", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", A[i]); i++; }
    else { push("ins", B[j]); j++; }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("ins", B[j++]);

  // Reine Leerraum-Segmente zwischen zwei Änderungen verschmelzen, damit
  // „alt neu“ nicht in Einzelwörter zerfällt.
  const merged: DiffSeg[] = [];
  for (let s = 0; s < out.length; s++) {
    const cur = out[s];
    const prev = merged[merged.length - 1];
    const next = out[s + 1];
    if (cur.k === "eq" && /^\s+$/.test(cur.x) && prev && next && prev.k !== "eq" && next.k !== "eq") {
      merged.push({ k: "del", x: cur.x }, { k: "ins", x: cur.x });
      continue;
    }
    merged.push(cur);
  }
  // Nach dem Verschmelzen Löschungen vor Einfügungen gruppieren.
  const final: DiffSeg[] = [];
  let dels = "", inss = "";
  const flush = () => {
    if (dels) final.push({ k: "del", x: dels });
    if (inss) final.push({ k: "ins", x: inss });
    dels = ""; inss = "";
  };
  for (const s of merged) {
    if (s.k === "del") dels += s.x;
    else if (s.k === "ins") inss += s.x;
    else { flush(); final.push(s); }
  }
  flush();
  return final;
}

/** Anteil geänderter Wörter, 0 bis 1 (für die Entscheidung „Wortvergleich lohnt“). */
export function changeRatio(segs: DiffSeg[]): number {
  let eq = 0, ch = 0;
  for (const s of segs) {
    const w = (s.x.match(/\S+/g) ?? []).length;
    if (s.k === "eq") eq += w; else ch += w;
  }
  return eq + ch === 0 ? 0 : ch / (eq + ch);
}
