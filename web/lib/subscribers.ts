// Abonnenten in Upstash Redis. Ein Hash "subs": Feld = E-Mail (lowercase),
// Wert = { providers, confirmedAt }. Ein Abonnent kann mehrere Anbietertypen
// abonniert haben; Abmeldung entfernt die E-Mail komplett.

import { Redis } from "@upstash/redis";

export type Subscriber = {
  email: string;
  providers: string[];
  confirmedAt: string;
  // ISO-Zeitpunkt der letzten Newsletter-Zustellung an diese Adresse.
  // Zusammen mit confirmedAt das Wasserzeichen: verschickt werden nur
  // Updates, die das System NACH max(confirmedAt, lastNotifiedAt) zum
  // ersten Mal gesehen hat.
  lastNotifiedAt?: string;
  // Gleiches Wasserzeichen für den wöchentlichen "Neu in der Datenbank"-
  // Newsletter (neue Rahmenwerke/Quellen), getrennt vom Update-Versand.
  lastFwNotifiedAt?: string;
};

type Stored = {
  providers: string[];
  confirmedAt: string;
  lastNotifiedAt?: string;
  lastFwNotifiedAt?: string;
};

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

// "new": E-Mail war noch nicht abonniert. "expanded": bestehender Abonnent
// hat mindestens eine neue Quelle hinzubekommen. "unchanged": alles schon
// vorhanden (z. B. wiederholter Aufruf desselben Bestätigungslinks).
export async function addSubscriber(
  email: string,
  newProviders: string[],
): Promise<"new" | "expanded" | "unchanged"> {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  const providers = new Set(existing?.providers ?? []);
  const before = providers.size;
  for (const p of newProviders) if (p) providers.add(p);
  if (existing && providers.size === before) return "unchanged";
  await redis().hset(KEY, {
    [key]: {
      providers: [...providers],
      confirmedAt: existing?.confirmedAt ?? new Date().toISOString(),
      ...(existing?.lastNotifiedAt ? { lastNotifiedAt: existing.lastNotifiedAt } : {}),
      ...(existing?.lastFwNotifiedAt ? { lastFwNotifiedAt: existing.lastFwNotifiedAt } : {}),
    } satisfies Stored,
  });
  return existing ? "expanded" : "new";
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
    lastNotifiedAt: s.lastNotifiedAt,
    lastFwNotifiedAt: s.lastFwNotifiedAt,
  }));
}

/** Wasserzeichen nach erfolgreichem Versand vorrücken. Verlorene Race mit
    einer parallelen Ab-/Ummeldung ist unkritisch (schlimmstenfalls eine
    Wiederholung bzw. ein gelöschter Eintrag bleibt gelöscht). */
export async function setLastNotified(email: string, iso: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  if (!existing) return; // zwischenzeitlich abgemeldet
  await redis().hset(KEY, { [key]: { ...existing, lastNotifiedAt: iso } satisfies Stored });
}

/** Wasserzeichen des Rahmenwerk-Newsletters nach erfolgreichem Versand vorrücken. */
export async function setLastFwNotified(email: string, iso: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  if (!existing) return; // zwischenzeitlich abgemeldet
  await redis().hset(KEY, { [key]: { ...existing, lastFwNotifiedAt: iso } satisfies Stored });
}
