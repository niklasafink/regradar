// Konten ohne Passwort (Magic Link) in Upstash Redis. Schlüssel ist die
// E-Mail-Adresse, dieselbe wie im Newsletter-Hash "subs": Wer abonniert hat
// und ein Konto anlegt, ist automatisch verknüpft (Mails tragen dann die
// Einschlägigkeit seiner Profile). Ein Konto kann beliebig viele
// Institutsprofile halten (Berater, Prüfer). Server-only.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redis } from "./subscribers";
import type { DomainProfile, Profile } from "./relevance/profile";

export interface Account {
  email: string;
  createdAt: string;
  profiles: Profile[];
  activeId?: string;
  /** Primäres Profil: gilt für den Newsletter. Fehlt es, das erste Profil. */
  primaryId?: string;
}

const ACCT = (email: string) => `acct:${email}`;
const SESS = (token: string) => `sess:${token}`;
const MAGIC = (token: string) => `mlink:${token}`;
const DOMPROF = (domain: string) => `domprof:${domain}`;

export const SESSION_COOKIE = "rr_session";
export const SUB_COOKIE = "rr_sub";
const SESSION_TTL = 60 * 60 * 24 * 90; // 90 Tage
const MAGIC_TTL = 60 * 30; // 30 Minuten
export const MAX_PROFILES = 30;

const normEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
export const domainOf = (email: string) => normEmail(email).split("@")[1] ?? "";

/* ---------- Konto und Profile ---------- */

export async function getAccount(email: string): Promise<Account | null> {
  return (await redis().get<Account>(ACCT(normEmail(email)))) ?? null;
}

async function putAccount(a: Account): Promise<void> {
  await redis().set(ACCT(a.email), a);
}

export async function ensureAccount(email: string): Promise<Account> {
  const e = normEmail(email);
  const existing = await getAccount(e);
  if (existing) return existing;
  const a: Account = { email: e, createdAt: new Date().toISOString(), profiles: [] };
  await putAccount(a);
  return a;
}

export async function saveProfile(email: string, p: Profile, makeActive = true): Promise<Account> {
  const a = await ensureAccount(email);
  const i = a.profiles.findIndex((x) => x.id === p.id);
  if (i >= 0) a.profiles[i] = p;
  else {
    if (a.profiles.length >= MAX_PROFILES) throw new Error(`Höchstens ${MAX_PROFILES} Profile je Konto`);
    a.profiles.push(p);
  }
  if (makeActive || !a.activeId) a.activeId = p.id;
  if (!a.primaryId || !a.profiles.some((x) => x.id === a.primaryId)) a.primaryId = a.profiles[0].id;
  await putAccount(a);
  return a;
}

export async function deleteProfile(email: string, id: string): Promise<Account | null> {
  const a = await getAccount(email);
  if (!a) return null;
  a.profiles = a.profiles.filter((p) => p.id !== id);
  if (a.activeId === id) a.activeId = a.profiles[0]?.id;
  if (a.primaryId === id) a.primaryId = a.profiles[0]?.id;
  await putAccount(a);
  return a;
}

export async function setActiveProfile(email: string, id: string): Promise<Account | null> {
  const a = await getAccount(email);
  if (!a || !a.profiles.some((p) => p.id === id)) return a;
  a.activeId = id;
  await putAccount(a);
  return a;
}

/** Primäres Profil (für den Newsletter): gesetztes oder das erste. */
export function primaryProfile(a: Account): Profile | null {
  return a.profiles.find((p) => p.id === a.primaryId) ?? a.profiles[0] ?? null;
}

export async function setPrimaryProfile(email: string, id: string): Promise<Account | null> {
  const a = await getAccount(email);
  if (!a || !a.profiles.some((p) => p.id === id)) return a;
  a.primaryId = id;
  await putAccount(a);
  return a;
}

/* ---------- Magic Link ---------- */

export async function createMagicLink(email: string, draft?: Profile): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await redis().set(MAGIC(token), { email: normEmail(email), draft: draft ?? null }, { ex: MAGIC_TTL });
  return token;
}

/** Einmalig einlösen (GET zeigt nur eine Bestätigungsseite, siehe Route). */
export async function consumeMagicLink(token: string): Promise<{ email: string; draft: Profile | null } | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const v = await redis().get<{ email: string; draft: Profile | null }>(MAGIC(token));
  if (!v) return null;
  await redis().del(MAGIC(token));
  return v;
}

export async function peekMagicLink(token: string): Promise<{ email: string } | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  return (await redis().get<{ email: string }>(MAGIC(token))) ?? null;
}

/* ---------- Session ---------- */

export async function createSession(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis().set(SESS(token), normEmail(email), { ex: SESSION_TTL });
  return token;
}

export async function sessionEmail(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[\w-]{20,64}$/.test(token)) return null;
  return (await redis().get<string>(SESS(token))) ?? null;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await redis().del(SESS(token));
  jar.delete(SESSION_COOKIE);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL,
};

/* ---------- Abonnenten-Cookie (Vorprofil über die Mail-Domain) ----------
   Gesetzt beim Bestätigen des Newsletters und bei Klicks auf Links aus
   Newsletter-Mails. Wert: signierte Abonnenten-Kennung (E-Mail, HMAC). */

const SECRET = process.env.SUBSCRIBE_SECRET ?? "dev-secret";
const sign = (s: string) => createHmac("sha256", `${SECRET}:rr_sub`).update(s).digest("base64url");

export function subCookieValue(email: string): string {
  const payload = Buffer.from(normEmail(email)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSubCookie(value: string | undefined): string | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const email = Buffer.from(payload, "base64url").toString();
  return isEmail(email) ? email : null;
}

export const subCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/* ---------- Vorprofile je Domain ---------- */

export async function getDomainProfile(domain: string): Promise<DomainProfile | null> {
  if (!domain) return null;
  return (await redis().get<DomainProfile>(DOMPROF(domain.toLowerCase()))) ?? null;
}

export async function putDomainProfile(dp: DomainProfile): Promise<void> {
  await redis().set(DOMPROF(dp.domain.toLowerCase()), dp, { ex: 60 * 60 * 24 * 180 });
}

/** Wer ist der Besucher? Konto (eingeloggt) vor Abonnent (Cookie). */
export async function currentVisitor(): Promise<{
  email: string | null;
  account: Account | null;
  subscriberEmail: string | null;
}> {
  const email = await sessionEmail();
  const account = email ? await ensureAccount(email) : null;
  const subscriberEmail = email ? null : readSubCookie((await cookies()).get(SUB_COOKIE)?.value);
  return { email, account, subscriberEmail };
}
