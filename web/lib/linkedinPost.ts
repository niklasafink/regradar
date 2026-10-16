// Automatischer LinkedIn-Tagespost über das private Profil des Betreibers.
//
// Ablauf (Nutzerentscheidung 15.10.2026, Regeln in LINKEDIN.md):
// 1. 18:00 (Berlin) am Vortag: Freigabe-Mail mit Text, Titel-Slide und PDF.
// 2. Klick in der Mail → Bestätigungsseite → Button (POST) speichert die Freigabe
//    samt Hash des Inhalts. Ein GET löst nie etwas aus (Link-Scanner).
// 3. 08:00 (Berlin) am Posttag: nur wenn freigegeben und der Inhalt seit der
//    Freigabe unverändert ist, geht der Post mit PDF raus, danach der erste
//    Kommentar mit dem Link. Hat sich der Inhalt geändert, kommt eine neue
//    Freigabe-Mail; eine Freigabe nach 08:00 postet sofort.
//
// LinkedIn-Zugang: OAuth mit „Share on LinkedIn“ (w_member_social) und
// „Sign In with LinkedIn using OpenID Connect“ (openid profile). Das Token gilt
// 60 Tage und lässt sich ohne Partnerstatus nicht verlängern; die Freigabe-Mail
// erinnert ab 7 Tagen vor Ablauf an die Neuverbindung.

import { createHash } from "node:crypto";
import { Resend } from "resend";
import { approverAddress, createSignedToken, senderFields } from "./email";
import { digestFor, type Digest } from "./linkedin";
import { digestPdf } from "./linkedinPdf";
import { redis } from "./subscribers";

const API = "https://api.linkedin.com";
const VERSION = process.env.LINKEDIN_API_VERSION ?? "202609";
const SCOPES = "openid profile w_member_social";
const DAY_MS = 86_400_000;

const KEY = {
  token: "linkedin:token",
  approved: (day: string) => `linkedin:approved:${day}`,
  asked: (day: string) => `linkedin:asked:${day}`,
  posted: (day: string) => `linkedin:posted:${day}`,
  lock: (day: string) => `linkedin:lock:${day}`,
};

export const base = () => process.env.APP_URL ?? "http://localhost:3000";

/* ---------- Zeit in Berlin ---------- */

export function berlin(now = new Date()): { day: string; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Gepostet wird montags bis freitags (Montag: Meldungen von Freitag bis Sonntag). */
const isPostDay = (iso: string) => {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return wd >= 1 && wd <= 5;
};

/** Fingerabdruck von allem, was im Post und auf den Slides steht. */
export function digestHash(d: Digest): string {
  return createHash("sha256").update(JSON.stringify([
    d.text, d.comment, d.cover, d.window,
    d.items.map((i) => [i.page.u.ti.de, i.page.u.d, i.kern]),
  ])).digest("hex").slice(0, 16);
}

/* ---------- LinkedIn-Zugang (OAuth) ---------- */

interface StoredToken { access: string; exp: number; sub: string; name?: string }

export async function getToken(): Promise<StoredToken | null> {
  const t = await redis().get<StoredToken>(KEY.token);
  return t && t.exp > Date.now() ? t : null;
}

const redirectUri = () => `${base()}/api/linkedin/callback`;

export function authorizeUrl(): string {
  const id = process.env.LINKEDIN_CLIENT_ID;
  if (!id) throw new Error("LINKEDIN_CLIENT_ID fehlt");
  const q = new URLSearchParams({
    response_type: "code", client_id: id, redirect_uri: redirectUri(), scope: SCOPES,
    state: createSignedToken("li-oauth", {}, 15 * 60_000),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

/** Code aus dem OAuth-Callback gegen ein Token tauschen und speichern. */
export async function connect(code: string): Promise<StoredToken> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: redirectUri(),
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  const tok = await res.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !tok.access_token) throw new Error(`Token-Tausch fehlgeschlagen: ${tok.error_description ?? res.status}`);
  const me = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const info = await me.json() as { sub?: string; name?: string };
  if (!me.ok || !info.sub) throw new Error(`userinfo fehlgeschlagen: HTTP ${me.status}`);
  const stored: StoredToken = {
    access: tok.access_token, sub: info.sub, name: info.name,
    exp: Date.now() + (tok.expires_in ?? 60 * 86400) * 1000,
  };
  await redis().set(KEY.token, stored);
  return stored;
}

/* ---------- Posten ---------- */

/** LinkedIn „little text format“: reservierte Zeichen maskieren. #Wort bleibt
    unmaskiert, LinkedIn macht daraus selbst einen Hashtag; die Vorlage
    {hashtag|\#|Wort} erschien am 16.10.2026 wörtlich im Post. */
export function littleText(text: string): string {
  return text
    .replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`)
    .replace(/#(?![0-9A-Za-zÄÖÜäöüß])/g, "\\#");
}

async function li(tok: StoredToken, path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.access}`, "Content-Type": "application/json",
      // LinkedIn-Version gilt nur für die versionierte /rest-API, nicht für /v2.
      ...(path.startsWith("/rest/") ? { "LinkedIn-Version": VERSION } : {}),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LinkedIn ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** Erster Kommentar mit dem Link. /rest/socialActions verlangt die Partner-API
    (Community Management, 403 partnerApiSocialActions.CREATE), daher die
    v2-Schnittstelle, die mit w_member_social auskommt. */
export async function comment(tok: StoredToken, urn: string, text: string): Promise<void> {
  await li(tok, `/v2/socialActions/${encodeURIComponent(urn)}/comments`, {
    actor: `urn:li:person:${tok.sub}`, object: urn, message: { text },
  });
}

/** Post mit PDF anlegen. Der Kommentar folgt getrennt (runPublish), damit ein
    Fehler dort nie zu einem zweiten Post führt. */
export async function publish(d: Digest): Promise<{ urn: string; url: string }> {
  const tok = await getToken();
  if (!tok) throw new Error("LinkedIn nicht verbunden oder Token abgelaufen");
  const author = `urn:li:person:${tok.sub}`;

  const init = await (await li(tok, "/rest/documents?action=initializeUpload",
    { initializeUploadRequest: { owner: author } })).json() as { value: { uploadUrl: string; document: string } };
  const up = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tok.access}`, "Content-Type": "application/octet-stream" },
    body: Buffer.from(await digestPdf(d)),
  });
  if (!up.ok) throw new Error(`PDF-Upload: HTTP ${up.status}`);
  // Das Dokument wird asynchron verarbeitet; erst wenn es AVAILABLE ist, posten.
  for (let i = 0; i < 20; i++) {
    const st = await fetch(`${API}/rest/documents/${encodeURIComponent(init.value.document)}`, {
      headers: { Authorization: `Bearer ${tok.access}`, "LinkedIn-Version": VERSION },
    });
    const s = st.ok ? (await st.json() as { status?: string }).status : undefined;
    if (s === "AVAILABLE") break;
    if (s === "PROCESSING_FAILED") throw new Error("LinkedIn konnte das PDF nicht verarbeiten");
    await new Promise((r) => setTimeout(r, 3000));
  }

  const post = await li(tok, "/rest/posts", {
    author,
    commentary: littleText(d.text),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { title: d.title, id: init.value.document } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
  const urn = post.headers.get("x-restli-id") ?? "";
  if (!urn) throw new Error("LinkedIn hat keine Post-ID geliefert");
  return { urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
}

/* ---------- Freigabe ---------- */

export const approveLink = (day: string) =>
  `${base()}/api/linkedin/approve?token=${encodeURIComponent(createSignedToken("li-approve", { day }, 3 * DAY_MS))}`;

export const connectLink = () =>
  `${base()}/api/linkedin/auth?token=${encodeURIComponent(createSignedToken("li-auth", {}, 7 * DAY_MS))}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function mail(subject: string, text: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY fehlt");
  const { error } = await new Resend(key).emails.send({ ...senderFields(), to: approverAddress(), subject, text, html });
  if (error) throw new Error(error.message);
}

const frame = (inner: string) =>
  `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
     <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>${inner}</div>`;

/** Hinweis, wenn LinkedIn nicht verbunden ist oder das Token bald abläuft. */
async function tokenNote(): Promise<{ text: string; html: string }> {
  const t = await getToken();
  const left = t ? Math.floor((t.exp - Date.now()) / DAY_MS) : -1;
  if (t && left > 7) return { text: "", html: "" };
  const msg = t
    ? `Die LinkedIn-Verbindung läuft in ${left} Tagen ab. Bitte neu verbinden:`
    : "LinkedIn ist nicht verbunden. Ohne Verbindung wird nichts gepostet. Jetzt verbinden:";
  const url = connectLink();
  return {
    text: `\n${msg}\n${url}\n`,
    html: `<p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;font-size:14px">${msg}<br><a href="${url}">LinkedIn verbinden →</a></p>`,
  };
}

export async function sendApprovalMail(d: Digest, reason = ""): Promise<void> {
  const url = approveLink(d.day);
  const pdf = `${base()}/api/linkedin/pdf?day=${d.day}`;
  const img = `${base()}/api/linkedin/slide?day=${d.day}&n=0`;
  const when = `${d.day.split("-").reverse().join(".")}, 08:00 Uhr`;
  const note = await tokenNote();
  await mail(
    `LinkedIn-Post zur Freigabe (${when}): ${d.cover}`,
    `${reason ? `${reason}\n\n` : ""}Der LinkedIn-Post für ${when} wartet auf Freigabe. Ohne Freigabe wird nichts gepostet.
${note.text}
Prüfen und freigeben:
${url}

PDF: ${pdf}

Text:
${d.text}

Erster Kommentar:
${d.comment}`,
    frame(`
      <p style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.5">
        ${reason ? `${esc(reason)}<br>` : ""}<strong>Der LinkedIn-Post für ${when} wartet auf Freigabe.</strong>
        Ohne deine Freigabe wird nichts gepostet.</p>
      ${note.html}
      <p style="margin:20px 0 24px"><a href="${url}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Prüfen und freigeben →</a></p>
      <p><a href="${pdf}"><img src="${img}" width="360" height="360" alt="Titel-Slide" style="border-radius:8px;border:1px solid #e2e8f0"></a></p>
      <p style="font-size:13px;color:#64748b"><a href="${pdf}">Slideshow als PDF ansehen</a></p>
      <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;border:1px solid #e2e8f0;border-radius:8px;padding:16px">${esc(d.text)}</div>
      <p style="font-size:13px;color:#64748b;margin-top:16px">Erster Kommentar: ${esc(d.comment)}</p>`),
  );
}

export interface Approval { hash: string; at: string }

export async function approve(d: Digest): Promise<void> {
  await redis().set(KEY.approved(d.day), { hash: digestHash(d), at: new Date().toISOString() } satisfies Approval,
    { ex: 7 * 86400 });
}

export async function postStatus(day: string) {
  const [approved, posted] = await Promise.all([
    redis().get<Approval>(KEY.approved(day)),
    redis().get<{ urn: string; url: string; at: string }>(KEY.posted(day)),
  ]);
  return { approved, posted };
}

/* ---------- Cron-Jobs ---------- */

/** 18:00: Freigabe-Mail für den Post am nächsten Morgen (einmal je Posttag). */
export async function runAsk(now = new Date(), force = false): Promise<string> {
  const day = addDays(berlin(now).day, 1);
  if (!isPostDay(day)) return `${day}: kein Posttag`;
  const d = digestFor(day);
  if (!d) return `${day}: keine Meldungen`;
  if (!force && !(await redis().set(KEY.asked(day), "1", { nx: true, ex: 3 * 86400 })))
    return `${day}: Freigabe-Mail schon verschickt`;
  await sendApprovalMail(d);
  return `${day}: Freigabe-Mail verschickt`;
}

/** 08:00 (bzw. sofort nach einer späten Freigabe): posten, wenn freigegeben. */
export async function runPublish(day = berlin().day): Promise<string> {
  const d = digestFor(day);
  if (!d) return `${day}: keine Meldungen`;
  const { approved, posted } = await postStatus(day);
  if (posted) return `${day}: schon gepostet (${posted.url})`;
  if (!approved) return `${day}: nicht freigegeben, nichts gepostet`;
  if (approved.hash !== digestHash(d)) {
    if (await redis().set(`${KEY.asked(day)}:changed:${digestHash(d)}`, "1", { nx: true, ex: 3 * 86400 }))
      await sendApprovalMail(d, "Der Inhalt hat sich seit deiner Freigabe geändert (neue oder geänderte Meldungen). Bitte erneut freigeben, dann geht der Post sofort raus.");
    return `${day}: Inhalt seit Freigabe geändert, neue Freigabe angefordert`;
  }
  if (!(await redis().set(KEY.lock(day), "1", { nx: true, ex: 600 }))) return `${day}: Posten läuft bereits`;
  let res: { urn: string; url: string };
  try {
    res = await publish(d);
    // Sofort als gepostet merken: ab hier darf kein Fehler mehr einen zweiten Post auslösen.
    await redis().set(KEY.posted(day), { ...res, at: new Date().toISOString() }, { ex: 30 * 86400 });
  } catch (e) {
    await redis().del(KEY.lock(day));
    const msg = e instanceof Error ? e.message : String(e);
    const note = await tokenNote();
    await mail(`LinkedIn-Post fehlgeschlagen: ${d.cover}`,
      `Der freigegebene Post konnte nicht gepostet werden:\n${msg}\n${note.text}\nErneut versuchen: Freigabe-Link erneut bestätigen.\n${approveLink(day)}`,
      frame(`<p style="font-size:14px">Der freigegebene Post konnte nicht gepostet werden:</p>
        <pre style="white-space:pre-wrap;font-size:12px;background:#f1f5f9;padding:12px;border-radius:8px">${esc(msg)}</pre>${note.html}
        <p><a href="${approveLink(day)}">Erneut versuchen →</a></p>`)).catch(() => {});
    throw e;
  }
  // Kommentar mit dem Link; scheitert er, ist der Post trotzdem online.
  let missing = "";
  const tok = await getToken();
  try {
    if (!tok) throw new Error("LinkedIn-Token fehlt");
    await comment(tok, res.urn, d.comment);
  } catch (e) {
    missing = e instanceof Error ? e.message : String(e);
    console.error("linkedin comment:", missing);
  }
  await mail(missing ? `LinkedIn-Post ist online, Kommentar fehlt: ${d.cover}` : `LinkedIn-Post ist online: ${d.cover}`,
    missing
      ? `Der Post ist online: ${res.url}\n\nDer erste Kommentar konnte nicht gesetzt werden:\n${missing}\n\nBitte von Hand kommentieren:\n${d.comment}`
      : `Der Post ist online: ${res.url}\nDer erste Kommentar mit dem Link steht darunter.`,
    frame(`${missing
      ? `<p style="font-size:14px">Der Post ist online, aber der erste Kommentar konnte nicht gesetzt werden:</p>
        <pre style="white-space:pre-wrap;font-size:12px;background:#f1f5f9;padding:12px;border-radius:8px">${esc(missing)}</pre>
        <p style="font-size:14px">Bitte von Hand kommentieren:<br>${esc(d.comment)}</p>`
      : `<p style="font-size:14px">Der Post ist online, der erste Kommentar mit dem Link steht darunter.</p>`}
      <p><a href="${res.url}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Auf LinkedIn ansehen →</a></p>`))
    .catch((e) => console.error("linkedin mail:", e));
  return `${day}: gepostet (${res.url})${missing ? `, Kommentar fehlt: ${missing}` : ""}`;
}
