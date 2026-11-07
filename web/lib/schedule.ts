// Feste Versandzeiten der Newsletter (Nutzerentscheidung 07.11.2026), alle in
// deutscher Zeit (Europe/Berlin, Sommer- und Winterzeit):
//   Montag   11:00 Freigabe-Mail Update-Newsletter, 12:00 Versand
//   Dienstag 11:00 Freigabe-Mail Praxis + Fristen,  12:00 Versand
//   Mo–Fr    12:00 Tages-Abonnenten, automatisch ohne Freigabe
//
// Vercel-Crons laufen im Hobby-Tarif irgendwann innerhalb der angegebenen
// Stunde. Deshalb lösen sie nur früh genug aus; die Mails werden bei Resend
// mit `scheduledAt` eingereicht und kommen zur vollen Stunde an. Liegt die
// Zielzeit schon zurück (späte Freigabe), geht die Mail sofort raus.

export const APPROVAL_HOUR_BERLIN = 11;
export const SEND_HOUR_BERLIN = 12;

const TZ = "Europe/Berlin";

/** Berliner Kalenderdatum und Stunde zu einem Zeitpunkt. */
export function berlinParts(now: Date): { y: number; m: number; d: number; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hour: Number(p.hour) };
}

/** true, wenn `now` in Berliner Zeit ein Montag ist (Tag der Freigabe-Mail
    des Update-Newsletters). */
export function isBerlinMonday(now: Date): boolean {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now) === "Mon";
}

/** Abstand Berlin zu UTC in Minuten (60 im Winter, 120 im Sommer). */
function offsetMin(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Zeitpunkt `hour`:00 Berliner Zeit am Berliner Kalendertag von `now`. */
export function berlinTime(now: Date, hour: number): Date {
  const { y, m, d } = berlinParts(now);
  const guess = new Date(Date.UTC(y, m - 1, d, hour));
  return new Date(guess.getTime() - offsetMin(guess) * 60_000);
}

/** ISO-Zeitpunkt für Resend `scheduledAt`, wenn `hour`:00 Berliner Zeit heute
    noch mindestens eine Minute entfernt ist; sonst undefined (sofort senden). */
export function scheduleAt(hour: number, now = new Date()): string | undefined {
  const at = berlinTime(now, hour);
  return at.getTime() - now.getTime() > 60_000 ? at.toISOString() : undefined;
}

/** "12:00 Uhr" bzw. "sofort" für Berichte und Statusseiten. */
export function scheduleLabel(iso: string | undefined): string {
  if (!iso) return "sofort";
  const { hour } = berlinParts(new Date(iso));
  return `${String(hour).padStart(2, "0")}:00 Uhr`;
}
