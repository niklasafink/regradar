// Nutzungsprotokoll der Einschlägigkeit (Profile, Prüfungen, Status, Export)
// und der tägliche Abendbericht an den Betreiber. Ereignisse landen in einer
// Redis-Liste; der Bericht liest sie, verschickt eine Tabelle und entfernt
// genau die gelesenen Einträge. Ohne Ereignisse geht keine Mail raus.

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { readSubCookie, sessionEmail, SUB_COOKIE } from "../accounts";
import { senderFields } from "../email";
import { berlinParts } from "../schedule";
import { redis } from "../subscribers";

const LOG = "relact:log";
const MAX_EVENTS = 5000;

export interface ActivityEvent {
  at: string;
  /** E-Mail des Kontos, sonst Abonnent (Cookie), sonst „Gast #<IP-Hash>“. */
  who: string;
  kind: "konto" | "abonnent" | "gast";
  action: string;
  detail?: string;
}

function operatorEmail(): string {
  return (process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de").toLowerCase();
}

async function actor(request: Request, email?: string | null): Promise<Pick<ActivityEvent, "who" | "kind">> {
  const konto = email ?? (await sessionEmail().catch(() => null));
  if (konto) return { who: konto, kind: "konto" };
  const sub = readSubCookie((await cookies()).get(SUB_COOKIE)?.value);
  if (sub) return { who: sub, kind: "abonnent" };
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  return { who: `Gast #${createHash("sha256").update(ip).digest("hex").slice(0, 6)}`, kind: "gast" };
}

/** Ereignis protokollieren. Fehler werden geschluckt: das Protokoll darf
    keine Nutzeraktion verhindern. Aktionen des Betreibers zählen nicht. */
export async function logActivity(request: Request, action: string, detail?: string, email?: string | null): Promise<void> {
  try {
    const a = await actor(request, email);
    if (a.who.toLowerCase() === operatorEmail()) return;
    const ev: ActivityEvent = { at: new Date().toISOString(), ...a, action, detail: detail?.slice(0, 120) };
    await redis().rpush(LOG, JSON.stringify(ev));
    await redis().ltrim(LOG, -MAX_EVENTS, -1);
  } catch (e) {
    console.error("activity log failed:", e);
  }
}

interface Row { who: string; kind: ActivityEvent["kind"]; action: string; n: number; details: string[]; first: string; last: string }

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Gleiche Aktion desselben Nutzers zu einer Zeile zusammenfassen. */
export function summarize(events: ActivityEvent[]): Row[] {
  const rows = new Map<string, Row>();
  for (const e of events) {
    const k = `${e.who}\u0000${e.action}`;
    const r = rows.get(k) ?? { who: e.who, kind: e.kind, action: e.action, n: 0, details: [], first: e.at, last: e.at };
    r.n++;
    if (e.detail && !r.details.includes(e.detail)) r.details.push(e.detail);
    if (e.at < r.first) r.first = e.at;
    if (e.at > r.last) r.last = e.at;
    rows.set(k, r);
  }
  // Nutzer nach erster Aktivität, innerhalb eines Nutzers chronologisch.
  const firstOf = new Map<string, string>();
  for (const r of rows.values()) if (!firstOf.has(r.who) || r.first < firstOf.get(r.who)!) firstOf.set(r.who, r.first);
  return [...rows.values()].sort((a, b) =>
    a.who === b.who ? a.first.localeCompare(b.first) : firstOf.get(a.who)!.localeCompare(firstOf.get(b.who)!));
}

function reportHtml(rows: Row[], users: number, events: number): string {
  const td = "padding:4px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top";
  let prev = "";
  const body = rows.map((r) => {
    const who = r.who === prev ? "" : `${esc(r.who)}${r.kind === "konto" ? "" : ` <span style="color:#94a3b8">(${r.kind})</span>`}`;
    prev = r.who;
    const more = r.details.length > 3 ? ` +${r.details.length - 3}` : "";
    const time = hhmm(r.first) === hhmm(r.last) ? hhmm(r.first) : `${hhmm(r.first)}–${hhmm(r.last)}`;
    return `<tr><td style="${td}">${who}</td><td style="${td}">${esc(r.action)}</td>`
      + `<td style="${td};color:#475569">${esc(r.details.slice(0, 3).join(" · "))}${more}</td>`
      + `<td style="${td};text-align:right">${r.n}</td><td style="${td};white-space:nowrap;color:#64748b">${time}</td></tr>`;
  }).join("");
  const th = "padding:4px 8px;text-align:left;border-bottom:1px solid #0f172a;font-weight:600";
  return `<div style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;color:#0f172a;font-size:13px">
    <p style="font-size:18px;margin:0 0 4px"><strong>regulatory</strong><em>radar</em></p>
    <p style="margin:0 0 12px">Einschlägigkeit heute: ${users} Nutzer, ${events} Aktionen.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><th style="${th}">Nutzer</th><th style="${th}">Aktion</th><th style="${th}">Details</th><th style="${th};text-align:right">Anz.</th><th style="${th}">Uhrzeit</th></tr>
      ${body}
    </table></div>`;
}

/** Abendbericht: alle seit dem letzten Bericht protokollierten Ereignisse.
    test=true schickt eine Vorschau, ohne die Liste zu leeren. */
export async function sendActivityReport(opts: { test?: boolean } = {}): Promise<{ sent: boolean; events: number; users?: number; reason?: string }> {
  const raw = await redis().lrange<string | ActivityEvent>(LOG, 0, -1);
  const events = raw.map((x) => (typeof x === "string" ? (JSON.parse(x) as ActivityEvent) : x));
  if (!events.length) return { sent: false, events: 0, reason: "keine Nutzung" };

  const { y, m, d } = berlinParts(new Date());
  const day = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (!opts.test) {
    const fresh = await redis().set(`relact:sent:${day}`, 1, { nx: true, ex: 60 * 60 * 30 });
    if (fresh !== "OK") return { sent: false, events: events.length, reason: "heute schon verschickt" };
  }

  const rows = summarize(events);
  const users = new Set(events.map((e) => e.who)).size;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY fehlt");
  const { error } = await new Resend(apiKey).emails.send({
    ...senderFields(),
    to: operatorEmail(),
    subject: `${opts.test ? "[Test] " : ""}Einschlägigkeit: ${users} Nutzer, ${events.length} Aktionen (${d}.${m}.)`,
    html: reportHtml(rows, users, events.length),
  });
  if (error) {
    if (!opts.test) await redis().del(`relact:sent:${day}`).catch(() => 0);
    throw new Error(error.message);
  }
  // Nur die gelesenen Einträge entfernen; was währenddessen dazukam, bleibt.
  if (!opts.test) await redis().ltrim(LOG, events.length, -1);
  return { sent: true, events: events.length, users };
}
