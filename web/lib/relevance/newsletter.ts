// Einschlägigkeit im Update-Newsletter: je Abonnent das primäre Profil seines Kontos
// (gleiche E-Mail-Adresse) oder, ohne Konto, das Vorprofil seiner Mail-Domain.
// Die Mail kennzeichnet nur, sie filtert nicht (Nutzerentscheidung 06.11.2026).

import { domainOf, getAccount, getDomainProfile, primaryProfile } from "../accounts";
import type { Subscriber } from "../subscribers";
import type { UpdatePage } from "../updates";
import { matchMany, STATUS_LABEL, type MatchResult } from "./match";
import type { Profile } from "./profile";

export interface MailRelevance {
  /** slug → je Profil das Ergebnis */
  bySlug: Map<string, { name: string; r: MatchResult }[]>;
  profiles: { name: string; origin: Profile["origin"] }[];
  fromDomain: boolean;
}

export async function profilesForSubscriber(email: string): Promise<{ profiles: Profile[]; fromDomain: boolean }> {
  const acct = await getAccount(email).catch(() => null);
  // Nur das primäre Profil kennzeichnet die Mail (Nutzerentscheidung 07.11.2026).
  const primary = acct ? primaryProfile(acct) : null;
  if (primary) return { profiles: [primary], fromDomain: false };
  const dp = await getDomainProfile(domainOf(email)).catch(() => null);
  return { profiles: dp?.profile ? [dp.profile] : [], fromDomain: !!dp?.profile };
}

/** Ergebnisse für die Updates einer Mail. Ohne KI-Zeit (noLlm) nur Cache
    und Regel-Vorfilter; nicht entschiedene Fälle bekommen dann keinen Chip. */
export async function relevanceForMail(
  sub: Subscriber,
  pages: UpdatePage[],
  opts: { noLlm?: boolean; deadlineMs?: number } = {},
): Promise<MailRelevance | null> {
  const { profiles, fromDomain } = await profilesForSubscriber(sub.email);
  if (!profiles.length) return null;
  const bySlug = new Map<string, { name: string; r: MatchResult }[]>();
  for (const p of profiles) {
    const res = await matchMany(
      p,
      pages.map((pg) => ({ key: `u:${pg.slug}`, fw: pg.fw, u: pg.u })),
      { concurrency: 4, noLlm: opts.noLlm, deadlineMs: opts.deadlineMs },
    );
    for (const pg of pages) {
      const r = res[`u:${pg.slug}`];
      if (!r || r.stufe === "fallback") continue;
      const list = bySlug.get(pg.slug) ?? [];
      list.push({ name: p.name, r });
      bySlug.set(pg.slug, list);
    }
  }
  return { bySlug, profiles: profiles.map((p) => ({ name: p.name, origin: p.origin })), fromDomain };
}

/** Vorab-Prüfung aller Profile × anstehender Updates (füllt den Cache, damit
    der Versand selbst schnell bleibt). Läuft nach der Freigabe-Anfrage. */
export async function warmRelevance(subs: Subscriber[], pages: UpdatePage[]): Promise<number> {
  const seen = new Set<string>();
  let n = 0;
  for (const sub of subs) {
    const { profiles } = await profilesForSubscriber(sub.email);
    for (const p of profiles) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      await matchMany(p, pages.map((pg) => ({ key: `u:${pg.slug}`, fw: pg.fw, u: pg.u })), { concurrency: 4 });
      n++;
    }
  }
  return n;
}

const PILL: Record<MatchResult["status"], string> = {
  ja: "background:#0f172a;color:#ffffff;border:1px solid #0f172a",
  teilweise: "color:#0f172a;border:1px solid #0f172a",
  nein: "color:#94a3b8;border:1px solid #e2e8f0",
  unsicher: "color:#475569;border:1px dashed #94a3b8",
};

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Chip-Zeile unter einem Update (HTML). Ein Profil: „Einschlägig für X“;
    mehrere: je Profil ein Chip. */
export function relevanceHtml(rel: MailRelevance | null, slug: string): string {
  const list = rel?.bySlug.get(slug);
  if (!list?.length) return "";
  const chips = list.map(({ name, r }) => {
    const label = r.status === "unsicher" && r.frage
      ? `${name}: unklar, ${r.frage.frage}`
      : `${STATUS_LABEL[r.status]} für ${name}${r.status === "teilweise" && r.teile ? ` (${r.teile})` : ""}`;
    return `<span style="display:inline-block;${PILL[r.status]};border-radius:9999px;padding:1px 10px;font-size:11px;font-weight:600;margin:0 6px 4px 0">${esc(label.slice(0, 160))}</span>`;
  });
  return `<p style="margin:0 0 6px">${chips.join("")}</p>`;
}

export function relevanceText(rel: MailRelevance | null, slug: string): string {
  const list = rel?.bySlug.get(slug);
  if (!list?.length) return "";
  return list.map(({ name, r }) => `${STATUS_LABEL[r.status]} für ${name}`).join("; ");
}

export function relevanceFooterHtml(rel: MailRelevance | null, base: string): string {
  if (!rel) return "";
  const who = rel.profiles.map((p) => esc(p.name)).join(", ");
  const how = rel.fromDomain
    ? `automatisch aus Ihrer E-Mail-Domain vorausgefüllt. <a href="${base}/profil" style="color:#0f172a">Profil prüfen und speichern</a>, damit die Einschätzung genau zu Ihrem Institut passt.`
    : `nach den Profilen in Ihrem Konto. <a href="${base}/profil" style="color:#0f172a">Profile verwalten</a>.`;
  return `<p style="margin:16px 0 0;font-size:12px;color:#64748b;line-height:1.6">Einschlägigkeit für ${who}: ${how} Automatische Einschätzung, keine Rechtsberatung.</p>`;
}

export function relevanceFooterText(rel: MailRelevance | null, base: string): string {
  if (!rel) return "";
  const who = rel.profiles.map((p) => p.name).join(", ");
  return rel.fromDomain
    ? `Einschlägigkeit für ${who}: automatisch aus Ihrer E-Mail-Domain vorausgefüllt. Profil prüfen und speichern: ${base}/profil`
    : `Einschlägigkeit für ${who} nach den Profilen in Ihrem Konto: ${base}/profil`;
}
