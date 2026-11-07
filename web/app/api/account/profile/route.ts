import {
  deleteProfile, getAccount, primaryProfile, putProfileCheck, saveProfile, sessionEmail, setActiveProfile, setPrimaryProfile,
} from "@/lib/accounts";
import { bumpCheck, profileChanged, sanitizeProfile } from "@/lib/relevance/profile";

/* Profile im Konto verwalten: speichern, löschen, aktiv setzen. */
export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    action?: "save" | "delete" | "activate" | "primary" | "recheck"; profile?: unknown; id?: string;
  };
  try {
    if (body.action === "save") {
      const p = sanitizeProfile(body.profile);
      if (!p) return Response.json({ error: "Profil ungültig" }, { status: 400 });
      const a = await saveProfile(email, p);
      return Response.json({ ok: true, activeId: a.activeId, profiles: a.profiles });
    }
    // „Neu prüfen“ nach einer Profiländerung: neue Prüfgeneration. Nur wenn
    // sich das Profil seit der letzten Prüfung geändert hat (Kosten).
    if (body.action === "recheck" && body.id) {
      const acct = await getAccount(email);
      const p = acct?.profiles.find((x) => x.id === body.id);
      if (!acct || !p) return Response.json({ error: "Profil nicht gefunden" }, { status: 404 });
      if (!profileChanged(p)) return Response.json({ ok: true, unchanged: true });
      bumpCheck(p);
      await putProfileCheck(email, p.id, p.check!);
      return Response.json({ ok: true });
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
  const a = await getAccount(email);
  return Response.json({ email, activeId: a?.activeId ?? null, primaryId: a ? primaryProfile(a)?.id ?? null : null,
    profiles: (a?.profiles ?? []).map((p) => ({ ...p, stale: profileChanged(p) })) },
    { headers: { "Cache-Control": "no-store" } });
}
