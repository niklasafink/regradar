// Abonnenten in Upstash Redis. Ein Hash "subs": Feld = E-Mail (lowercase),
// Wert = { providers, confirmedAt }. Ein Abonnent kann mehrere Anbietertypen
// abonniert haben; Abmeldung entfernt die E-Mail komplett.

import { Redis } from "@upstash/redis";

export type Subscriber = {
  email: string;
  providers: string[];
  confirmedAt: string;
};

type Stored = { providers: string[]; confirmedAt: string };

const KEY = "subs";

let client: Redis | null = null;
export function redis(): Redis {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN fehlen in web/.env.local",
      );
    }
    client = new Redis({ url, token });
  }
  return client;
}

export async function addSubscriber(email: string, newProviders: string[]) {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  const providers = new Set(existing?.providers ?? []);
  for (const p of newProviders) if (p) providers.add(p);
  await redis().hset(KEY, {
    [key]: {
      providers: [...providers],
      confirmedAt: existing?.confirmedAt ?? new Date().toISOString(),
    } satisfies Stored,
  });
}

export async function removeSubscriber(email: string): Promise<boolean> {
  const removed = await redis().hdel(KEY, email.trim().toLowerCase());
  return removed > 0;
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const all = await redis().hgetall<Record<string, Stored>>(KEY);
  if (!all) return [];
  return Object.entries(all).map(([email, s]) => ({
    email,
    providers: s.providers ?? [],
    confirmedAt: s.confirmedAt,
  }));
}
