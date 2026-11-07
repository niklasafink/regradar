import { after } from "next/server";
import { logActivity } from "@/lib/relevance/activity";
import { getAccount, sessionEmail } from "@/lib/accounts";
import { applyAnswers } from "@/lib/relevance/profile";
import { prefillProfile, saveAndReconcile } from "@/lib/relevance/server";

export const maxDuration = 300;

/* Rückfrage aus der Einschlägigkeits-Zeile beantworten (angemeldet):
   Antwort ins Profil übernehmen und speichern. Nur Ergebnisse, die an
   diesem Merkmal hängen, werden verworfen und gleich neu geprüft. */
export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { profileId?: string; answers?: Record<string, boolean | null> };
  const a = await getAccount(email);
  const p = a?.profiles.find((x) => x.id === (body.profileId ?? a.activeId));
  if (!p) return Response.json({ error: "Profil nicht gefunden" }, { status: 404 });
  applyAnswers(p, body.answers ?? {});
  const { profile, removed } = await saveAndReconcile(email, p, false);
  await logActivity(request, "Rückfrage beantwortet", `${p.name}: ${Object.keys(body.answers ?? {}).join(", ")}`, email);
  if (removed) after(() => prefillProfile(profile, 270_000).catch((e) => console.error("prefill failed:", e)));
  return Response.json({ ok: true, rechecked: removed ?? 0 });
}
