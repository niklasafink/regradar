// Gemeinsame Server-Logik der Einschlägigkeits-Routen: Prüfziele auflösen,
// Profil des Besuchers bestimmen, Rate-Limit, Magic-Link-Mail.

import { Resend } from "resend";
import {
  currentVisitor, domainOf, getAccount, getDomainProfile, putDomainProfile, putProfileCheck, saveProfile, type Account,
} from "../accounts";
import { senderFields } from "../email";
import { FRAMEWORKS, frameworkById } from "../logic";
import { redis } from "../subscribers";
import { UPDATE_PAGES, updateBySlug } from "../updates";
import { invalidateChanged, matchMany, storedCount, type MatchTarget } from "./match";
import { profileFromDomain, profileValues, sanitizeProfile, type DomainProfile, type Profile } from "./profile";

/** "u:<slug>" = Update, "f:<id>" = Rahmenwerk als Ganzes. */
export function resolveTarget(key: string): MatchTarget | null {
  if (key.startsWith("u:")) {
    const page = updateBySlug(key.slice(2));
    return page ? { key, fw: page.fw, u: page.u } : null;
  }
  if (key.startsWith("f:")) {
    const fw = frameworkById(key.slice(2));
    return fw ? { key, fw } : null;
  }
  return null;
}

/** Alle Ziele, für die die Website einen Status zeigt: jedes Update und
    jedes Rahmenwerk. */
export function allTargetKeys(): string[] {
  return [...UPDATE_PAGES.map((p) => `u:${p.slug}`), ...FRAMEWORKS.map((f) => `f:${f.id}`)];
}

/** Profiländerung übernehmen: nur betroffene Ergebnisse verwerfen und den
    Ausgangsstand auf die neuen Merkmale setzen. Liefert die Zahl der
    verworfenen Ergebnisse (null = nichts geändert). */
export async function reconcileProfile(email: string, p: Profile): Promise<number | null> {
  const vals = profileValues(p);
  if (!p.check || p.check.vals === vals) return null;
  const { removed } = await invalidateChanged(p, p.check.vals, resolveTarget);
  p.check = { gen: p.check.gen, vals, at: new Date().toISOString() };
  await putProfileCheck(email, p.id, p.check);
  return removed.length;
}

/** Profil speichern; bei geänderten Merkmalen nur Betroffenes verwerfen. */
export async function saveAndReconcile(email: string, p: Profile, makeActive = true): Promise<{ account: Account; profile: Profile; removed: number | null }> {
  const account = await saveProfile(email, p, makeActive);
  const saved = account.profiles.find((x) => x.id === p.id)!;
  const removed = await reconcileProfile(email, saved);
  return { account, profile: saved, removed };
}

/** Komplettlauf: alle noch nicht gespeicherten Ziele eines Profils prüfen,
    bis die Zeit um ist. Bereits gespeicherte Paare kosten nichts. Eine
    Sperre je Profil verhindert parallele Läufe. */
export async function prefillProfile(p: Profile, deadlineMs: number, only?: string[]): Promise<{ total: number; stored: number; skipped?: boolean }> {
  const keys = only ?? allTargetKeys();
  const lock = `rlock:prefill:${p.id}`;
  const got = await redis().set(lock, 1, { nx: true, ex: Math.ceil(deadlineMs / 1000) + 60 }).catch(() => "OK");
  if (got !== "OK") return { total: keys.length, stored: await storedCount(p, keys), skipped: true };
  try {
    const stopAt = Date.now() + deadlineMs;
    // Kleine Pakete: Ergebnisse landen nach jedem Paket im Profil-Speicher,
    // ein Abbruch durch das Zeitlimit kostet höchstens ein Paket.
    for (let i = 0; i < keys.length && Date.now() < stopAt; i += 20) {
      const targets = keys.slice(i, i + 20).map(resolveTarget).filter((t) => t !== null);
      await matchMany(p, targets, { concurrency: 10, deadlineMs: Math.max(0, stopAt - Date.now()) });
    }
    return { total: keys.length, stored: await storedCount(p, keys) };
  } finally {
    await redis().del(lock).catch(() => 0);
  }
}

/** Alle Kontoprofile: Profiländerungen abgleichen, fehlende Paare prüfen
    (neue Updates, abgebrochene Läufe). Für den Stundenlauf. */
export async function prefillAll(deadlineMs: number): Promise<{ profiles: number; complete: number; open: number }> {
  const stopAt = Date.now() + deadlineMs;
  const emails: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis().scan(cursor, { match: "acct:*", count: 500 });
    cursor = String(next);
    emails.push(...batch.map((k) => k.slice(5)));
  } while (cursor !== "0");
  const all: Profile[] = [];
  for (const email of emails) {
    const a = await getAccount(email);
    for (const p of a?.profiles ?? []) {
      await reconcileProfile(email, p);
      all.push(p);
    }
  }
  // Erst das, was Nutzer zuerst sehen (alle Rahmenwerke und die neuesten
  // Updates), für jedes Profil; danach der Rest. So bekommt bei knappem
  // Budget oder vielen Profilen nicht ein Profil alles und die anderen nichts
  // (Befund 11.11.2026).
  const keys = allTargetKeys();
  const first = [...keys.filter((k) => k.startsWith("f:")), ...keys.filter((k) => k.startsWith("u:")).slice(0, PRIORITY_UPDATES)];
  for (const p of all) {
    const left = stopAt - Date.now();
    if (left > 5_000) await prefillProfile(p, left, first);
  }
  let complete = 0;
  let open = 0;
  for (const p of all) {
    const left = stopAt - Date.now();
    // Ohne Restzeit nur zählen, nicht prüfen.
    const r = left > 5_000 ? await prefillProfile(p, left) : { total: keys.length, stored: await storedCount(p, keys) };
    if (r.stored >= r.total) complete++;
    else open += r.total - r.stored;
  }
  return { profiles: all.length, complete, open };
}

/** So viele der neuesten Updates prüft der Stundenlauf je Profil vorrangig. */
const PRIORITY_UPDATES = 150;

export interface VisitorProfile {
  profile: Profile | null;
  source: "konto" | "domain" | "entwurf" | null;
  account: Account | null;
  /** Für den Hinweis „vorausgefüllt aus Ihrer E-Mail-Domain“. */
  domain?: string;
}

/** Konto (aktives oder gewähltes Profil) > Vorprofil der Abonnenten-Domain >
    Entwurf aus dem Browser (Gast, noch nicht registriert). */
export async function visitorProfile(opts: { profileId?: string; draft?: unknown; preferDraft?: boolean } = {}): Promise<VisitorProfile> {
  const { account, subscriberEmail } = await currentVisitor();
  if (opts.preferDraft) {
    const d = sanitizeProfile(opts.draft);
    if (d) return { profile: d, source: "entwurf", account };
  }
  if (account) {
    const p = account.profiles.find((x) => x.id === (opts.profileId ?? account.activeId)) ?? account.profiles[0] ?? null;
    if (p) return { profile: p, source: "konto", account };
  }
  const draft = sanitizeProfile(opts.draft);
  if (draft) return { profile: draft, source: "entwurf", account };
  if (subscriberEmail) {
    const domain = domainOf(subscriberEmail);
    const dp = await getDomainProfile(domain);
    if (dp?.profile) return { profile: dp.profile, source: "domain", account, domain };
  }
  return { profile: null, source: null, account };
}

/** Einfaches Tageslimit je IP (schützt das KI-Budget vor Missbrauch). */
export async function rateLimit(request: Request, bucket: string, perDay: number): Promise<boolean> {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const key = `rl:${bucket}:${ip}:${new Date().toISOString().slice(0, 10)}`;
  try {
    const n = await redis().incr(key);
    if (n === 1) await redis().expire(key, 60 * 60 * 26);
    return n <= perDay;
  } catch {
    return true;
  }
}

/** Vorprofil für eine Abonnenten-Domain anlegen, falls noch keines existiert. */
export async function ensureDomainProfile(email: string, force = false): Promise<DomainProfile | null> {
  const domain = domainOf(email);
  if (!domain) return null;
  const existing = await getDomainProfile(domain);
  if (existing && !force) return existing;
  const dp = await profileFromDomain(domain);
  await putDomainProfile(dp);
  return dp;
}

export async function sendMagicLinkMail(email: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY fehlt");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${base}/api/auth/verify?t=${encodeURIComponent(token)}`;
  const { error } = await new Resend(apiKey).emails.send({
    ...senderFields(),
    to: email,
    subject: "Ihr Anmeldelink für Regulatory Radar",
    text: `regulatoryradar

Mit diesem Link melden Sie sich an und speichern Ihr Institutsprofil:

${url}

Der Link ist 30 Minuten gültig und funktioniert einmal. Ein Passwort gibt es nicht.
Wenn Sie den Link nicht angefordert haben, ignorieren Sie diese E-Mail.

Datenschutz: ${base}/datenschutz`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
        <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
        <p>Mit diesem Link melden Sie sich an und speichern Ihr Institutsprofil:</p>
        <p style="margin:28px 0">
          <a href="${url}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">
            Anmelden
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">Der Link ist 30 Minuten gültig und funktioniert einmal.
        Ein Passwort gibt es nicht. Wenn Sie den Link nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
        <p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8">
          <a href="${base}/datenschutz" style="color:#64748b">Datenschutz</a>
        </p>
      </div>`,
  });
  if (error) throw new Error(error.message);
}
