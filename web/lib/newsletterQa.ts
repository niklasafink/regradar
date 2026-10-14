// QS-Ergebnis je Wochen-Slot des Update-Newsletters. Die automatische QS
// (scraper/newsletter_qa.py, Anweisung scraper/NEWSLETTER_QA.md) meldet ihr
// Ergebnis über POST /api/newsletter/qa; erst danach verschickt runNewsletter
// die Freigabe-Mail an den Betreiber.
//
// Redis: newsletter:qa:<Slot-ISO> → QaRecord (8 Tage, dann ist der Slot vorbei)

import { redis } from "./subscribers";

export type QaRecord = {
  /** Abschluss der QS (ISO). */
  at: string;
  /** false = QS ist gescheitert oder hat offene Zweifel; die Freigabe-Mail
      zeigt den Bericht dann als Warnung. */
  ok: boolean;
  /** Kurzbericht der QS (Klartext, deutsch). */
  report: string;
  /** Geprüfte Slugs; später hinzugekommene gelten als ungeprüft. */
  checked?: string[];
  /** Deploy-Stand (Git-Commit), auf dem die QS die Liste geprüft hat. */
  commit?: string;
  /** Letzte Freigabe-Mail für diesen Slot (ISO). */
  approvalAt?: string;
};

const TTL_S = 8 * 24 * 3600;
const key = (slot: string) => `newsletter:qa:${slot}`;

export async function readQa(slot: string): Promise<QaRecord | null> {
  return (await redis().get<QaRecord>(key(slot))) ?? null;
}

export async function writeQa(slot: string, rec: QaRecord): Promise<void> {
  await redis().set(key(slot), rec, { ex: TTL_S });
}

export async function markApprovalSent(slot: string, iso: string): Promise<void> {
  const rec = await readQa(slot);
  if (rec) await writeQa(slot, { ...rec, approvalAt: iso });
}
