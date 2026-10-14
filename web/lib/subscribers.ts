// Abonnenten in Upstash Redis. Ein Hash "subs": Feld = E-Mail (lowercase),
// Wert = { providers, confirmedAt }. Ein Abonnent kann mehrere Anbietertypen
// abonniert haben; Abmeldung entfernt die E-Mail komplett.

import { Redis } from "@upstash/redis";
import type { Frequency } from "./email";

export type Subscriber = {
  email: string;
  providers: string[];
  confirmedAt: string;
  // Rhythmus des Update-Newsletters. Seit 14.10.2026 immer "weekly"; der
  // Versand behandelt jeden Abonnenten als Wochen-Abo, auch Alt-Einträge.
  frequency?: Frequency;
  // ISO-Zeitpunkt der letzten Newsletter-Zustellung an diese Adresse.
  // Zusammen mit confirmedAt das Wasserzeichen: verschickt werden nur
  // Updates, die das System NACH max(confirmedAt, lastNotifiedAt) zum
  // ersten Mal gesehen hat.
  lastNotifiedAt?: string;
  // Gleiches Wasserzeichen für den wöchentlichen "Neu in der Datenbank"-
  // Newsletter (neue Rahmenwerke/Quellen), getrennt vom Update-Versand.
  lastFwNotifiedAt?: string;
  // Rahmenwerk-IDs, auf die der Update-Newsletter beschränkt ist (Kinder
  // erben das Abo des Eltern-Rahmenwerks). Leer/fehlend = keine Beschränkung,
  // es gilt der Institutsart-Filter. Mit Auswahl entfällt die
  // "Neu in der Datenbank"-Mail.
  frameworks?: string[];
};

type Stored = {
  providers: string[];
  confirmedAt: string;
  frequency?: Frequency;
  lastNotifiedAt?: string;
  lastFwNotifiedAt?: string;
  frameworks?: string[];
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
// hat mindestens eine neue Quelle hinzubekommen oder seine Rahmenwerk-Auswahl
// geändert. "unchanged": alles schon vorhanden (z. B. wiederholter Aufruf
// desselben Bestätigungslinks).
// Institutsarten werden vereinigt, die Rahmenwerk-Auswahl dagegen ersetzt:
// die zuletzt bestätigte Auswahl gilt (leer = alle Updates).
export async function addSubscriber(
  email: string,
  newProviders: string[],
  frameworks: string[] = [],
): Promise<"new" | "expanded" | "unchanged"> {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  const providers = new Set(existing?.providers ?? []);
  const before = providers.size;
  for (const p of newProviders) if (p) providers.add(p);
  const nextFreq: Frequency = "weekly"; // täglicher Versand abgeschafft (14.10.2026)
  const freqChanged = existing ? nextFreq !== existing.frequency : false;
  const nextFw = [...new Set(frameworks.filter(Boolean))].sort();
  const fwChanged = existing
    ? nextFw.join(",") !== [...(existing.frameworks ?? [])].sort().join(",")
    : false;
  if (existing && providers.size === before && !freqChanged && !fwChanged) return "unchanged";
  await redis().hset(KEY, {
    [key]: {
      providers: [...providers],
      confirmedAt: existing?.confirmedAt ?? new Date().toISOString(),
      frequency: nextFreq,
      ...(existing?.lastNotifiedAt ? { lastNotifiedAt: existing.lastNotifiedAt } : {}),
      ...(existing?.lastFwNotifiedAt ? { lastFwNotifiedAt: existing.lastFwNotifiedAt } : {}),
      ...(nextFw.length ? { frameworks: nextFw } : {}),
    } satisfies Stored,
  });
  // Reine Rhythmus-Änderung wird gespeichert, zählt aber nicht als "Abo
  // erweitert" (keine irreführende Betreiber-Mail über neue Quellen).
  if (existing && providers.size === before && !fwChanged) return "unchanged";
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
    frequency: s.frequency,
    lastNotifiedAt: s.lastNotifiedAt,
    lastFwNotifiedAt: s.lastFwNotifiedAt,
    frameworks: s.frameworks,
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

/** Rhythmus auf wöchentlich setzen (Alt-Links „Rhythmus ändern“ aus früheren
    Mails). true = gespeichert, false = Adresse ist (nicht mehr) abonniert. */
export async function setWeekly(email: string): Promise<boolean> {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  if (!existing) return false;
  if (existing.frequency === "weekly") return true;
  await redis().hset(KEY, { [key]: { ...existing, frequency: "weekly" } satisfies Stored });
  return true;
}

/** Wasserzeichen des Rahmenwerk-Newsletters nach erfolgreichem Versand vorrücken. */
export async function setLastFwNotified(email: string, iso: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const existing = await redis().hget<Stored>(KEY, key);
  if (!existing) return; // zwischenzeitlich abgemeldet
  await redis().hset(KEY, { [key]: { ...existing, lastFwNotifiedAt: iso } satisfies Stored });
}
