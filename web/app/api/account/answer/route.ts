import { getAccount, saveProfile, sessionEmail } from "@/lib/accounts";
import { applyAnswers } from "@/lib/relevance/profile";

/* Rückfrage aus der Einschlägigkeits-Zeile beantworten (angemeldet):
   Antwort ins Profil übernehmen und speichern. */
export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { profileId?: string; answers?: Record<string, boolean | null> };
  const a = await getAccount(email);
  const p = a?.profiles.find((x) => x.id === (body.profileId ?? a.activeId));
  if (!p) return Response.json({ error: "Profil nicht gefunden" }, { status: 404 });
  applyAnswers(p, body.answers ?? {});
  await saveProfile(email, p, false);
  return Response.json({ ok: true });
}
