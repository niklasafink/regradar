// OpenRouter-Client für Abgleich und Recherche mit harter Wochenbremse.
// Kosten kommen aus usage.cost der Antwort (auch bei Routern mit
// dynamischem Preis) und laufen in Redis pro ISO-Woche auf. Ist das Budget
// erreicht, liefern Aufrufe einen BudgetError; der Abgleich fällt dann auf
// den Regel-Vorfilter bzw. „unsicher“ zurück. Server-only.

import { redis } from "../subscribers";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Wochenbudget der Website (Abgleich + Recherche) in USD. Die Anforderungs-
    analyse im Scraper hat ein eigenes Budget (scope.py); zusammen ≈ 3 €/Woche. */
export const WEEKLY_BUDGET_USD = Number(process.env.RELEVANCE_WEEKLY_BUDGET_USD ?? "2.5");

export const MODELS = {
  matchA: process.env.RELEVANCE_MODEL_A ?? "openai/gpt-oss-120b",
  matchB: process.env.RELEVANCE_MODEL_B ?? "qwen/qwen3.7-flash",
  arbiter: process.env.RELEVANCE_MODEL_ARBITER ?? "typesafe/jev-router",
  research: process.env.RELEVANCE_MODEL_RESEARCH ?? "openai/gpt-oss-120b",
};

export class BudgetError extends Error {
  constructor() { super("Wochenbudget für den Einschlägigkeits-Abgleich erreicht"); }
}

export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

const costKey = () => `relcost:${isoWeek()}`;

export async function spentThisWeek(): Promise<number> {
  try {
    return Number((await redis().get<number | string>(costKey())) ?? 0);
  } catch {
    return 0;
  }
}

async function book(usd: number): Promise<void> {
  if (!(usd > 0)) return;
  try {
    const k = costKey();
    await redis().incrbyfloat(k, usd);
    await redis().expire(k, 60 * 60 * 24 * 60);
  } catch { /* Buchung darf den Abgleich nicht blockieren */ }
}

export interface ChatResult<T> { data: T; costUsd: number; model: string }

export async function chatJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  web?: boolean;
  temperature?: number;
}): Promise<ChatResult<T>> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY fehlt");
  if ((await spentThisWeek()) >= WEEKLY_BUDGET_USD) throw new BudgetError();

  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 1500,
    response_format: { type: "json_object" },
    // Reasoning-Modelle (gpt-oss) verbrauchen sonst das Token-Limit vor der Antwort.
    reasoning: { effort: "low" },
    usage: { include: true },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.web) body.plugins = [{ id: "web", max_results: 5 }];

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://regradar.de",
          "X-Title": "regradar relevance",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { cost?: number };
        model?: string;
        error?: { message?: string };
      };
      const cost = Number(json.usage?.cost ?? 0);
      await book(cost);
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      const content = (json.choices?.[0]?.message?.content ?? "").trim()
        .replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (!content) throw new Error(`${opts.model}: leere Antwort`);
      const data = JSON.parse(start >= 0 ? content.slice(start, end + 1) : content) as T;
      return { data, costUsd: cost, model: json.model ?? opts.model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
