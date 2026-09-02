// Fortschritt & Sperre für den freigegebenen Newsletter-Versand.
//
// Der Klick auf den Freigabe-Link antwortet sofort mit einer Fortschritts-
// seite; der eigentliche Versand läuft danach weiter (next/server `after`)
// und schreibt seinen Stand nach Redis. Die Seite pollt ihn über die
// Approve-Route (?status=1).
//
// Die Lauf-Sperre verhindert, dass zwei parallele Freigabe-Klicks
// (Doppelklick, Mail-Scanner-Prefetch) denselben Versand doppelt starten —
// das war neben dem Rate-Limit die zweite Ursache der Doppelzustellungen
// vom 01.09.

import type { ApproveKind } from "./email";
import { redis } from "./subscribers";

export type SendProgress = {
  kind: ApproveKind;
  /** Abonnenten im Verteiler insgesamt. */
  total: number;
  /** In diesem Lauf verschickte Mails. */
  sent: number;
  /** Übersprungen: bereits beliefert bzw. nichts Neues für den Abonnenten. */
  skipped: number;
  errors: number;
  done: boolean;
  startedAt: string;
  updatedAt: string;
};

const progressKey = (kind: ApproveKind) => `newsletter:progress:${kind}`;
const lockKey = (kind: ApproveKind) => `newsletter:sendlock:${kind}`;

export async function writeProgress(p: Omit<SendProgress, "updatedAt">): Promise<void> {
  await redis().set(
    progressKey(p.kind),
    { ...p, updatedAt: new Date().toISOString() } satisfies SendProgress,
    { ex: 60 * 60 },
  );
}

export async function readProgress(kind: ApproveKind): Promise<SendProgress | null> {
  return await redis().get<SendProgress>(progressKey(kind));
}

/** true = Sperre bekommen, Versand darf laufen. TTL als Selbstheilung, falls
    ein Lauf hart abbricht; regulärer Abschluss gibt die Sperre sofort frei. */
export async function acquireSendLock(kind: ApproveKind): Promise<boolean> {
  const res = await redis().set(lockKey(kind), new Date().toISOString(), {
    nx: true,
    ex: 600,
  });
  return res === "OK";
}

export async function releaseSendLock(kind: ApproveKind): Promise<void> {
  await redis().del(lockKey(kind));
}
