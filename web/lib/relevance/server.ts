// Gemeinsame Server-Logik der Einschlägigkeits-Routen: Prüfziele auflösen,
// Profil des Besuchers bestimmen, Rate-Limit, Magic-Link-Mail.

import { Resend } from "resend";
import {
  currentVisitor, domainOf, getDomainProfile, putDomainProfile, type Account,
} from "../accounts";
import { senderFields } from "../email";
import { frameworkById } from "../logic";
import { redis } from "../subscribers";
import { updateBySlug } from "../updates";
import type { MatchTarget } from "./match";
import { profileFromDomain, sanitizeProfile, type DomainProfile, type Profile } from "./profile";

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
