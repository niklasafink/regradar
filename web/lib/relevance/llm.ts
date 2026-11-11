// OpenRouter-Client für Abgleich und Recherche mit harter Monatsbremse.
// Kosten kommen aus usage.cost der Antwort (auch bei Routern mit
// dynamischem Preis) und laufen in Redis pro Kalendermonat auf. Ist das Budget
// erreicht, liefern Aufrufe einen BudgetError; der Abgleich fällt dann auf
// den Regel-Vorfilter bzw. „unsicher“ zurück. Server-only.

import { Resend } from "resend";
import { senderFields } from "../email";
import { redis } from "../subscribers";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Monatsbudget der Website für alle Einschlägigkeits-Läufe (Abgleich,
    Schiedsrichter, Profil-Recherche): 20 € (Nutzerentscheidung 07.11.2026).
    OpenRouter rechnet in USD; der Kurs ist bewusst niedrig angesetzt, damit
    das Limit in Euro sicher hält. Die Anforderungsanalyse im Scraper hat ein
    eigenes Budget (scope.py). */
export const MONTHLY_BUDGET_EUR = Number(process.env.RELEVANCE_MONTHLY_BUDGET_EUR ?? "20");
const EUR_USD = Number(process.env.RELEVANCE_EUR_USD ?? "1.05");
export const MONTHLY_BUDGET_USD = MONTHLY_BUDGET_EUR * EUR_USD;

/* Modellwahl nach Vergleichstest vom 07.11.2026 (112 Paare aus Update und
   Profil, 7 Modelle): A + B zusammen 98 % Treffer, Schiedsrichter nur bei
   Abweichung. A und B kommen bewusst von verschiedenen Anbietern. */
export const MODELS = {
  matchA: process.env.RELEVANCE_MODEL_A ?? "deepseek/deepseek-v4.1-flash",
  matchB: process.env.RELEVANCE_MODEL_B ?? "google/gemini-3.1-flash-lite",
  arbiter: process.env.RELEVANCE_MODEL_ARBITER ?? "deepseek/deepseek-v4-pro",
  research: process.env.RELEVANCE_MODEL_RESEARCH ?? "openai/gpt-oss-120b",
};

export class BudgetError extends Error {
  constructor(message = "Monatsbudget für den Einschlägigkeits-Abgleich erreicht") { super(message); }
}

/** Der Anbieter nimmt gerade gar keine Anfragen an (Guthaben leer, Schlüssel
    ungültig, Drosselung, Störung). Das betrifft alle Paare gleich und ist
    kein Befund zum einzelnen Paar: Der Abgleich behandelt es wie einen
    Budget-Stopp, zählt keinen Fehlversuch und speichert kein „Unklar“
    (Befund 11.11.2026: leeres Guthaben schrieb 8.000 „Unklar“ fest). */
export class ProviderDownError extends BudgetError {
  constructor(public status: number, detail: string) { super(`Anbieter nicht verfügbar (HTTP ${status}): ${detail}`); }
}

/* Nach einem Ausfall wegen Guthaben oder Schlüssel fragt die Website den
   Anbieter fünf Minuten lang nicht mehr an (ein Komplettlauf würde sonst
   tausende Anfragen ins Leere schicken). */
const DOWN_KEY = "relcost:down";
const DOWN_TTL = 300;

const DOWN_STATUS = new Set([401, 402, 403, 429, 500, 502, 503, 504]);

/** Betreiber einmal am Tag benachrichtigen, wenn das Guthaben leer ist. */
async function alertCredits(detail: string): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const fresh = await redis().set(`relalert:credits:${day}`, 1, { nx: true, ex: 60 * 60 * 30 });
    const apiKey = process.env.RESEND_API_KEY;
    if (fresh !== "OK" || !apiKey) return;
    const { error } = await new Resend(apiKey).emails.send({
      ...senderFields(),
      to: (process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de").toLowerCase(),
      subject: "Einschlägigkeit: OpenRouter-Guthaben aufgebraucht",
      text: `Der Einschlägigkeits-Abgleich auf regradar.de bekommt von OpenRouter keine Antworten mehr (HTTP 402).

Meldung: ${detail}

Bis das Guthaben aufgeladen ist, sehen Nutzer nur regelbasierte Ergebnisse; alles andere steht auf „Prüfung derzeit ausgelastet“. Nach dem Aufladen holt der Stundenlauf die offenen Prüfungen nach.

Aufladen: https://openrouter.ai/settings/credits`,
    });
    if (error) await redis().del(`relalert:credits:${day}`).catch(() => 0);
  } catch (e) {
    console.error("credit alert failed:", e);
  }
}

export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

const costKey = (d = new Date()) => `relcost:m:${d.toISOString().slice(0, 7)}`;

export async function spentThisMonth(): Promise<number> {
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
    await redis().expire(k, 60 * 60 * 24 * 400);
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
  if ((await spentThisMonth()) >= MONTHLY_BUDGET_USD) throw new BudgetError();
  const down = await redis().get<string>(DOWN_KEY).catch(() => null);
  if (down) throw new ProviderDownError(Number(String(down).split("|")[0]) || 402, String(down).split("|").slice(1).join("|"));

  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 1500,
    usage: { include: true },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  // DeepSeek denkt im JSON-Modus endlos bis ans Token-Limit; ohne ihn liefert
  // es sauberes JSON, das unten ohnehin aus dem Text geschnitten wird.
  if (!opts.model.startsWith("deepseek/")) body.response_format = { type: "json_object" };
  // gpt-oss verbraucht sonst das Token-Limit vor der Antwort; bei DeepSeek
  // wirkt der Parameter nicht, Gemini Flash-Lite denkt ohnehin kaum.
  if (opts.model.startsWith("openai/")) body.reasoning = { effort: "low" };
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
      if (!res.ok && DOWN_STATUS.has(res.status)) {
        const detail = json.error?.message ?? `HTTP ${res.status}`;
        if (res.status === 402) await alertCredits(detail);
        if (res.status < 429) await redis().set(DOWN_KEY, `${res.status}|${detail.slice(0, 200)}`, { ex: DOWN_TTL }).catch(() => 0);
        throw new ProviderDownError(res.status, detail);
      }
      if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      const content = (json.choices?.[0]?.message?.content ?? "").trim()
        .replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (!content) throw new Error(`${opts.model}: leere Antwort`);
      const data = JSON.parse(start >= 0 ? content.slice(start, end + 1) : content) as T;
      return { data, costUsd: cost, model: json.model ?? opts.model };
    } catch (e) {
      // Leeres Guthaben oder ungültiger Schlüssel: ein zweiter Versuch ändert nichts.
      if (e instanceof ProviderDownError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
