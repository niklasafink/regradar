import { after } from "next/server";
import {
  deleteProfile, getAccount, primaryProfile, sessionEmail, setActiveProfile, setPrimaryProfile,
} from "@/lib/accounts";
import { logActivity } from "@/lib/relevance/activity";
import { sanitizeProfile } from "@/lib/relevance/profile";
import { prefillProfile, saveAndReconcile } from "@/lib/relevance/server";

// Nach dem Speichern prüft ein Komplettlauf im Hintergrund alle noch offenen
// Paare einmal (neues Profil: alle; geändertes Profil: nur die betroffenen).
export const maxDuration = 300;

/* Profile im Konto verwalten: speichern, löschen, aktiv setzen. */
export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    action?: "save" | "delete" | "activate" | "primary"; profile?: unknown; id?: string;
  };
  try {
    if (body.action === "save") {
      const p = sanitizeProfile(body.profile);
      if (!p) return Response.json({ error: "Profil ungültig" }, { status: 400 });
      const { account: a, profile, removed } = await saveAndReconcile(email, p);
      await logActivity(request, removed === null ? "Profil gespeichert" : "Profil geändert", removed ? `${profile.name} (${removed} neu zu prüfen)` : profile.name, email);
      after(() => prefillProfile(profile, 270_000).catch((e) => console.error("prefill failed:", e)));
      return Response.json({ ok: true, activeId: a.activeId, profiles: a.profiles, rechecked: removed ?? 0 });
    }
    if (body.action === "delete" && body.id) {
      const a = await deleteProfile(email, body.id);
      await logActivity(request, "Profil gelöscht", body.id, email);
      return Response.json({ ok: true, activeId: a?.activeId ?? null, profiles: a?.profiles ?? [] });
    }
    if (body.action === "activate" && body.id) {
      const a = await setActiveProfile(email, body.id);
      await logActivity(request, "Profil gewechselt", a?.profiles.find((x) => x.id === body.id)?.name ?? body.id, email);
      return Response.json({ ok: true, activeId: a?.activeId ?? null });
    }
    if (body.action === "primary" && body.id) {
      const a = await setPrimaryProfile(email, body.id);
      await logActivity(request, "Hauptprofil gesetzt", a?.profiles.find((x) => x.id === body.id)?.name ?? body.id, email);
      return Response.json({ ok: true, primaryId: a ? primaryProfile(a)?.id ?? null : null });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 400 });
  }
  return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
}

/* Volle Profile des Kontos (für die Profilverwaltung). */
export async function GET() {
  const email = await sessionEmail();
  if (!email) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const a = await getAccount(email);
  return Response.json({ email, activeId: a?.activeId ?? null, primaryId: a ? primaryProfile(a)?.id ?? null : null,
    profiles: a?.profiles ?? [] },
    { headers: { "Cache-Control": "no-store" } });
}
