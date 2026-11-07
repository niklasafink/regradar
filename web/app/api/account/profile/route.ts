import { deleteProfile, primaryProfile, saveProfile, sessionEmail, setActiveProfile, setPrimaryProfile } from "@/lib/accounts";
import { sanitizeProfile } from "@/lib/relevance/profile";

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
      const a = await saveProfile(email, p);
      return Response.json({ ok: true, activeId: a.activeId, profiles: a.profiles });
    }
    if (body.action === "delete" && body.id) {
      const a = await deleteProfile(email, body.id);
      return Response.json({ ok: true, activeId: a?.activeId ?? null, profiles: a?.profiles ?? [] });
    }
    if (body.action === "activate" && body.id) {
      const a = await setActiveProfile(email, body.id);
      return Response.json({ ok: true, activeId: a?.activeId ?? null });
    }
    if (body.action === "primary" && body.id) {
      const a = await setPrimaryProfile(email, body.id);
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
  const { getAccount } = await import("@/lib/accounts");
  const a = await getAccount(email);
  return Response.json({ email, activeId: a?.activeId ?? null, primaryId: a ? primaryProfile(a)?.id ?? null : null, profiles: a?.profiles ?? [] },
    { headers: { "Cache-Control": "no-store" } });
}
