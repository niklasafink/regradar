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

// ------------------------------------------------------ Resend-Kontingent
//
// Scheitert ein Send an Resends Tages-/Monatslimit (nicht am 2/s-Rate-Limit,
// das fängt der Pacer ab), bricht der Sendelauf sofort ab (s. email.ts
// isQuotaExceededError) statt die restliche Liste garantiert erfolglos
// durchzuprobieren. Der Block-Zustand hier hält fest, dass noch Abonnenten
// offen sind; der stündliche externe Takt (lib/health.ts runCheck, GitHub
// Actions) prüft ihn und stößt einmal täglich eine neue Freigabe-Anfrage für
// die übrigen Abonnenten an — Versand nur nach erneutem Klick des Betreibers.

export type QuotaBlock = {
  kind: ApproveKind;
  errorName: string;
  blockedAt: string;
  sent: number;
  remaining: number;
};

const quotaKey = (kind: ApproveKind) => `newsletter:quotablock:${kind}`;
const quotaAlertKey = (kind: ApproveKind) => `newsletter:quotablock:alerted:${kind}`;
const quotaRetryKey = (kind: ApproveKind) => `newsletter:quotablock:retry:${kind}`;

export async function setQuotaBlock(block: QuotaBlock): Promise<void> {
  await redis().set(quotaKey(block.kind), block);
}

export async function readQuotaBlock(kind: ApproveKind): Promise<QuotaBlock | null> {
  return await redis().get<QuotaBlock>(quotaKey(kind));
}

/** Aufräumen, sobald ein Lauf wieder komplett durchläuft, ohne erneut am
    Kontingent zu scheitern. */
export async function clearQuotaBlock(kind: ApproveKind): Promise<void> {
  await redis().del(quotaKey(kind));
}

/** true = noch keine Sofort-Alarmmail für diesen Block raus (und der Weg
    sofort für 20h gesperrt) — verhindert Mail-Spam, falls kurz hintereinander
    mehrere Läufe wieder ans selbe Limit stoßen. */
export async function acquireQuotaAlert(kind: ApproveKind): Promise<boolean> {
  const res = await redis().set(quotaAlertKey(kind), new Date().toISOString(), {
    nx: true,
    ex: 20 * 60 * 60,
  });
  return res === "OK";
}

/** true = heute noch keine erneute Freigabe-Anfrage wegen eines bestehenden
    Kontingent-Blocks verschickt (und sofort für 20h gesperrt). */
export async function acquireQuotaRetry(kind: ApproveKind): Promise<boolean> {
  const res = await redis().set(quotaRetryKey(kind), new Date().toISOString(), {
    nx: true,
    ex: 20 * 60 * 60,
  });
  return res === "OK";
}
