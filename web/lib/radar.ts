// Entscheidungspunkte der Radar-Checkliste (Mail von scraper/regradar/gapreport.py).
// Jeder Punkt der Mail bekommt hier einen Datensatz und einen signierten Link:
// Auf der Seite entscheidet der Betreiber direkt (Empfehlung übernehmen), lässt
// eine KI-Analyse mit Vorschlag und Links erstellen oder gibt der KI per
// Textfeld Anweisungen. Den Rest erledigt der Stundenlauf (scraper/radar_actions.py).
//
// Ablauf (status):
//   open → analysis_requested → analyzed → approved → done | failed
//   open → approved (Empfehlung übernommen)      open/analyzed → dismissed (nichts tun)
//   analyzed → analysis_requested (Betreiber sieht es anders, Kommentar geht an die KI)
//
// Redis: radar:item:<id> → RadarItem (60 Tage), radar:ids → Set aller Ids

import { createSignedToken, verifySignedToken } from "./email";
import { redis } from "./subscribers";

export type RadarKind = "dublette" | "rahmenwerk" | "scraper";
export type RadarStatus =
  | "open"
  | "analysis_requested"
  | "analyzed"
  | "approved"
  | "done"
  | "failed"
  | "dismissed";

export type RadarLink = { label: string; url: string };

export type RadarItem = {
  id: string;
  kind: RadarKind;
  /** Nummer in der Checkliste der Mail. */
  nr: number;
  createdAt: string;
  title: string;
  /** Hintergrund (Begründung, Aktualität), Klartext. */
  detail?: string;
  /** Quellen des Punkts (Einträge der Dublette, Meldungen, Artikel). */
  links: RadarLink[];
  /** Erlaubte Entscheidungscodes für diese Art. */
  codes: string[];
  recommendation?: { code: string; reason: string };
  /** Für die Ausführung: Typ und Ids der Dubletten-Einträge, Rahmenwerk-Schlüssel. */
  meta?: Record<string, unknown>;
  status: RadarStatus;
  /** Ergebnis der KI-Analyse. */
  analysis?: { at: string; proposal: string; code: string; links: RadarLink[] };
  /** Anweisung des Betreibers aus dem Textfeld (zuletzt gesendet). */
  comment?: string;
  decision?: { at: string; code: string; via: "recommendation" | "analysis" };
  /** Ausführungsbericht des Stundenlaufs. */
  result?: { at: string; ok: boolean; report: string };
};

const TTL_S = 60 * 24 * 3600;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const key = (id: string) => `radar:item:${id}`;
const IDS = "radar:ids";

export const RADAR_CODES: Record<RadarKind, string[]> = {
  dublette: ["eigenstaendig", "dublette-behalte-a", "dublette-behalte-b"],
  rahmenwerk: ["aufnehmen", "ignorieren"],
  scraper: ["neue-quelle", "abgedeckt", "ignorieren"],
};

export const radarToken = (id: string) => createSignedToken("radar-item", { id }, TOKEN_TTL_MS);
export const radarTokenId = (token: string) => verifySignedToken(token, "radar-item")?.id ?? null;

export async function readItem(id: string): Promise<RadarItem | null> {
  return (await redis().get<RadarItem>(key(id))) ?? null;
}

export async function writeItem(item: RadarItem): Promise<void> {
  await redis().set(key(item.id), item, { ex: TTL_S });
  await redis().sadd(IDS, item.id);
}

export async function listItems(statuses?: RadarStatus[]): Promise<RadarItem[]> {
  const ids = (await redis().smembers(IDS)) as string[];
  const items = await Promise.all(ids.map(readItem));
  const alive = items.filter((i): i is RadarItem => i !== null);
  const gone = ids.filter((_, n) => items[n] === null);
  if (gone.length) await redis().srem(IDS, ...gone);
  return statuses ? alive.filter((i) => statuses.includes(i.status)) : alive;
}

/** Neue Punkte anlegen; bereits bearbeitete (status ≠ open) bleiben unverändert. */
export async function upsertItems(items: RadarItem[]): Promise<void> {
  for (const item of items) {
    const existing = await readItem(item.id);
    if (existing && existing.status !== "open") continue;
    await writeItem(item);
  }
}
