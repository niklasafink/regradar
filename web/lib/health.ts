// Überwachung der Scraper. Der stündliche Lauf auf dem Mac (scraper/run_hourly.sh)
// schickt am Ende einen "Herzschlag" mit dem Zustand aller Quellen und
// Pipeline-Schritte hierher (POST /api/health/heartbeat). Bewertet wird bei
// jedem Herzschlag und zusätzlich durch einen externen Takt (GitHub Actions
// stündlich, Vercel-Cron täglich → GET /api/health/check), damit auch ein
// komplett ausgefallener Rechner auffällt.
//
// Regel: Ein Scraper (Quelle oder Pipeline-Schritt), der länger als STALE_MS
// nicht erfolgreich gelaufen ist, gilt als ausgefallen → sofort eine Mail an
// den Betreiber mit Button zur Statusseite (/admin/health), die einen
// Reparaturauftrag auslöst. Den Auftrag holt scraper/repair_agent.py auf dem
// Mac ab (minütlich) und meldet seine Schritte hierher zurück, die Seite
// zeigt sie live.
//
// Alarm-Zustand liegt im Redis-Hash health:alerts: pro Problem einmal Mail,
// Erinnerung alle 24 h, "wieder OK"-Mail nach Behebung.

import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { senderFields } from "./email";
import { redis } from "./subscribers";
import {
  evaluate,
  fmtBerlin,
  repairTargetFor,
  type AlertRecord,
  type HeartbeatState,
  type Problem,
  type RepairState,
  type RepairStep,
} from "./healthTypes";

export * from "./healthTypes";

const REMIND_MS = 24 * 60 * 60 * 1000;
const REPAIR_TTL_S = 7 * 24 * 60 * 60;

const KEY_STATE = "health:state";
const KEY_ALERTS = "health:alerts";
const KEY_PENDING = "health:repair:pending";
const KEY_TICK = "health:tick";
const repairKey = (source: string) => `health:repair:${source}`;

// ------------------------------------------------------------------ Auth

/** Gemeinsames Geheimnis Mac ↔ Vercel (Herzschlag, Reparatur-Agent): das
    ohnehin vorhandene CRON_SECRET (auf Vercel und in web/.env.local), optional
    ein eigenes HEALTH_SECRET. */
export function healthSecretOk(request: Request): boolean {
  const secret = process.env.HEALTH_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cron-/Betreiber-Aufruf: CRON_SECRET (Vercel Cron) oder HEALTH_SECRET,
    als Bearer-Header oder ?secret=. */
export function operatorOk(request: Request): boolean {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("secret") ?? "";
  if (!given) return false;
  return [process.env.CRON_SECRET, process.env.HEALTH_SECRET].some((s) => {
    if (!s) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(s);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

// Token für die Statusseite: signiert wie die anderen Mail-Links (SUBSCRIBE_SECRET),
// unbefristet, eigener act-Wert — lässt sich nicht für Abmeldung o. ä. missbrauchen.
const SECRET = process.env.SUBSCRIBE_SECRET ?? "dev-secret";
const sign = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64url");

export function createHealthToken(): string {
  const payload = Buffer.from(JSON.stringify({ act: "health" })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyHealthToken(token: string): boolean {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { act?: string };
    return data.act === "health";
  } catch {
    return false;
  }
}

export function healthPageUrl(repair?: string): string {
  const base = process.env.APP_URL ?? "https://www.regradar.de";
  const q = new URLSearchParams({ t: createHealthToken() });
  if (repair) q.set("repair", repair);
  return `${base}/admin/health?${q.toString()}`;
}

// ------------------------------------------------------------------ Zustand

export async function readState(): Promise<HeartbeatState | null> {
  return await redis().get<HeartbeatState>(KEY_STATE);
}

export async function writeState(raw: Omit<HeartbeatState, "receivedAt">): Promise<HeartbeatState> {
  const state: HeartbeatState = {
    ...raw,
    stepsLastOk: raw.stepsLastOk ?? {},
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    receivedAt: new Date().toISOString(),
  };
  await redis().set(KEY_STATE, state);
  return state;
}

// ------------------------------------------------------------------ Alarm

export type CheckResult = {
  problems: Problem[];
  newProblems: Problem[];
  reminders: Problem[];
  recovered: { key: string; label: string; since: string }[];
  mailed: boolean;
  mailError?: string;
};

export async function readAlerts(): Promise<Record<string, AlertRecord>> {
  return (await redis().hgetall<Record<string, AlertRecord>>(KEY_ALERTS)) ?? {};
}

/** Bewerten, mit dem Alarm-Zustand abgleichen, Mails schicken. Schlägt der
    Versand fehl, bleibt der Alarm-Zustand unverändert (nächster Takt
    versucht es erneut). */
export async function runCheck(opts: { sendMail?: boolean } = {}): Promise<CheckResult> {
  const sendMail = opts.sendMail ?? true;
  const state = await readState();
  const problems = evaluate(state);
  const alerts = await readAlerts();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const newProblems: Problem[] = [];
  const reminders: Problem[] = [];
  for (const p of problems) {
    const a = alerts[p.key];
    if (!a) newProblems.push(p);
    else if (nowMs - Date.parse(a.lastMailAt) > REMIND_MS) reminders.push(p);
  }
  const recovered = Object.entries(alerts)
    .filter(([key]) => !problems.some((p) => p.key === key))
    .map(([key, a]) => ({ key, label: a.label, since: a.since }));

  const result: CheckResult = { problems, newProblems, reminders, recovered, mailed: false };
  if (!newProblems.length && !reminders.length && !recovered.length) return result;
  if (!sendMail) return result;

  try {
    await sendHealthMail({ newProblems, reminders, recovered, problems });
    result.mailed = true;
  } catch (e) {
    result.mailError = e instanceof Error ? e.message : String(e);
    return result;
  }
  const r = redis();
  for (const p of [...newProblems, ...reminders]) {
    const rec: AlertRecord = { since: alerts[p.key]?.since ?? nowIso, lastMailAt: nowIso, label: p.label };
    await r.hset(KEY_ALERTS, { [p.key]: rec });
  }
  if (recovered.length) await r.hdel(KEY_ALERTS, ...recovered.map((x) => x.key));
  return result;
}

const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function notifyAddress(): string {
  return process.env.NOTIFY_EMAIL ?? "niklas.fink@hotmail.de";
}

export async function sendHealthMail(input: {
  newProblems: Problem[];
  reminders: Problem[];
  recovered: { key: string; label: string; since: string }[];
  problems: Problem[];
  testMode?: boolean;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY fehlt");
  const resend = new Resend(apiKey);
  const { newProblems, reminders, recovered, problems } = input;
  const active = [...newProblems, ...reminders];
  const firstTarget = problems.length ? repairTargetFor(problems[0].key) : undefined;
  const pageUrl = healthPageUrl(firstTarget);

  let subject: string;
  if (newProblems.length) subject = `⚠️ Scraper-Alarm: ${newProblems.map((p) => p.label).join(", ")}`;
  else if (reminders.length) subject = `⚠️ Weiterhin ausgefallen: ${reminders.map((p) => p.label).join(", ")}`;
  else subject = `✓ Scraper wieder OK: ${recovered.map((r) => r.label).join(", ")}`;
  if (input.testMode) subject = `[TEST] ${subject}`;

  const problemRows = (list: Problem[]) =>
    list
      .map(
        (p) => `<li style="margin:0 0 10px">
          <strong>${esc(p.label)}</strong><br>
          <span style="color:#475569">Letzter Erfolg: ${esc(fmtBerlin(p.since))}</span>
          ${p.detail ? `<br><span style="color:#64748b;font-size:13px">${esc(p.detail.slice(0, 300))}</span>` : ""}
          <br><a href="${esc(healthPageUrl(repairTargetFor(p.key)))}" style="font-size:13px;color:#0f172a">Reparatur für ${esc(p.label)} starten →</a>
        </li>`,
      )
      .join("");

  const sections: string[] = [];
  if (newProblems.length) {
    sections.push(`<h2 style="font-size:16px;margin:24px 0 8px">Seit über einem Tag nicht gelaufen</h2>
      <ul style="padding-left:18px;margin:0">${problemRows(newProblems)}</ul>`);
  }
  if (reminders.length) {
    sections.push(`<h2 style="font-size:16px;margin:24px 0 8px">Weiterhin ausgefallen (Erinnerung)</h2>
      <ul style="padding-left:18px;margin:0">${problemRows(reminders)}</ul>`);
  }
  if (recovered.length) {
    sections.push(`<h2 style="font-size:16px;margin:24px 0 8px">Wieder in Ordnung</h2>
      <ul style="padding-left:18px;margin:0">${recovered
        .map((r) => `<li><strong>${esc(r.label)}</strong> <span style="color:#64748b">(ausgefallen seit ${esc(fmtBerlin(r.since))})</span></li>`)
        .join("")}</ul>`);
  }
  const stillOthers = problems.filter((p) => !active.some((a) => a.key === p.key));
  if (stillOthers.length) {
    sections.push(`<p style="color:#64748b;font-size:13px;margin:16px 0 0">Außerdem weiterhin offen: ${esc(
      stillOthers.map((p) => p.label).join(", "),
    )}</p>`);
  }

  const text = [
    input.testMode ? "TEST-MAIL der Scraper-Überwachung." : "",
    newProblems.length ? "Seit über einem Tag nicht gelaufen:\n" + newProblems.map((p) => `- ${p.label} (letzter Erfolg ${fmtBerlin(p.since)}) ${p.detail}`).join("\n") : "",
    reminders.length ? "Weiterhin ausgefallen:\n" + reminders.map((p) => `- ${p.label} (letzter Erfolg ${fmtBerlin(p.since)})`).join("\n") : "",
    recovered.length ? "Wieder in Ordnung:\n" + recovered.map((r) => `- ${r.label}`).join("\n") : "",
    "",
    `Status und Reparatur: ${pageUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { error } = await resend.emails.send({
    ...senderFields(),
    to: notifyAddress(),
    subject,
    text,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em> <span style="color:#94a3b8;font-size:13px">Scraper-Überwachung</span></p>
        ${input.testMode ? `<p style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:8px 12px;font-size:13px">Testmail: Alarm-Zustand wurde nicht verändert.</p>` : ""}
        ${
          active.length
            ? `<p style="font-size:15px;line-height:1.5">${active.length === 1 ? "Ein Scraper ist" : `${active.length} Scraper sind`} seit über einem Tag nicht erfolgreich gelaufen. Ein Klick startet die automatische Reparatur; die Seite zeigt live, was der Rechner gerade tut.</p>
               <p style="margin:20px 0 28px">
                 <a href="${esc(pageUrl)}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Reparatur starten und Status ansehen →</a>
               </p>`
            : `<p style="font-size:15px;line-height:1.5">Alles läuft wieder.</p>
               <p style="margin:20px 0 28px">
                 <a href="${esc(healthPageUrl())}" style="background:#fff;color:#0f172a;border:1px solid #cbd5e1;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Status ansehen →</a>
               </p>`
        }
        ${sections.join("")}
        <p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.6">
          Regel: Alarm, sobald eine Quelle oder ein Pipeline-Schritt länger als 24 Stunden nicht erfolgreich lief.
          Erinnerung täglich, solange es offen ist; Entwarnung automatisch.
        </p>
      </div>`,
  });
  if (error) throw new Error(error.message);
}

/** Externer Takt ohne Auth (GitHub Actions): höchstens alle 4 Minuten eine
    Bewertung, damit der offene Endpunkt nicht als Lastquelle taugt. */
export async function acquireTick(): Promise<boolean> {
  const res = await redis().set(KEY_TICK, new Date().toISOString(), { nx: true, ex: 240 });
  return res === "OK";
}

// ------------------------------------------------------------------ Reparatur

export async function readRepair(source: string): Promise<RepairState | null> {
  return await redis().get<RepairState>(repairKey(source));
}

export async function writeRepair(state: RepairState): Promise<void> {
  await redis().set(repairKey(state.source), state, { ex: REPAIR_TTL_S });
}

export async function pendingRepairs(): Promise<string[]> {
  return (await redis().smembers(KEY_PENDING)) ?? [];
}

export async function listRepairs(): Promise<Record<string, RepairState>> {
  const st = await readState();
  const ids = ["pipeline", ...(st?.sources ?? []).map((s) => s.id)];
  const out: Record<string, RepairState> = {};
  if (!ids.length) return out;
  const values = await redis().mget<(RepairState | null)[]>(...ids.map(repairKey));
  values.forEach((v, i) => {
    if (v) out[ids[i]] = v;
  });
  return out;
}

const REPAIR_ACTIVE_MS = 45 * 60 * 1000;

/** Auftrag anlegen (idempotent: ein laufender Auftrag wird zurückgegeben,
    nicht verdoppelt). */
export async function requestRepair(source: string, label: string): Promise<RepairState> {
  const existing = await readRepair(source);
  if (
    existing &&
    (existing.status === "requested" || existing.status === "running") &&
    Date.now() - Date.parse(existing.updatedAt) < REPAIR_ACTIVE_MS
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  const state: RepairState = {
    source,
    label,
    status: "requested",
    requestedAt: now,
    updatedAt: now,
    steps: [
      {
        at: now,
        title: "Reparaturauftrag angenommen",
        status: "info",
        detail: "Der Rechner holt Aufträge jede Minute ab. Läuft er gerade nicht (Ruhezustand, ausgeschaltet), beginnt die Reparatur, sobald er wieder wach ist.",
      },
    ],
  };
  await writeRepair(state);
  await redis().sadd(KEY_PENDING, source);
  return state;
}

/** Fortschrittsmeldung des Agenten übernehmen. */
export async function updateRepair(update: {
  source: string;
  label?: string;
  status: RepairState["status"];
  steps: RepairStep[];
  result?: string;
}): Promise<RepairState> {
  const existing = await readRepair(update.source);
  const now = new Date().toISOString();
  const state: RepairState = {
    source: update.source,
    label: update.label ?? existing?.label ?? update.source,
    status: update.status,
    requestedAt: existing?.requestedAt ?? now,
    updatedAt: now,
    steps: update.steps,
    result: update.result,
  };
  await writeRepair(state);
  if (state.status === "done" || state.status === "failed") {
    await redis().srem(KEY_PENDING, update.source);
  }
  return state;
}
