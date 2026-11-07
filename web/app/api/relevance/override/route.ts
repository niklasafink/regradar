import { logActivity } from "@/lib/relevance/activity";
import { getAccount, sessionEmail } from "@/lib/accounts";
import { setOverride, type Status } from "@/lib/relevance/match";
import { resolveTarget } from "@/lib/relevance/server";

const STATUSES: Status[] = ["ja", "teilweise", "nein", "unsicher"];

/* Status eines Updates oder Rahmenwerks selbst festlegen (nur angemeldet).
   status = null stellt die automatische Einschätzung wieder her. Ein
   gesetzter Status löst keine KI-Prüfung aus und bleibt auch nach
   Profiländerungen stehen. */
export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { key?: string; status?: string | null; profileId?: string };
  if (!body.key || !resolveTarget(body.key)) return Response.json({ error: "Unbekanntes Ziel" }, { status: 400 });
  const status = body.status === null ? null : STATUSES.find((s) => s === body.status);
  if (status === undefined) return Response.json({ error: "Status ungültig" }, { status: 400 });
  const a = await getAccount(email);
  const p = a?.profiles.find((x) => x.id === (body.profileId ?? a.activeId)) ?? a?.profiles[0];
  if (!p) return Response.json({ error: "Profil nicht gefunden" }, { status: 404 });
  await setOverride(p, body.key, status);
  await logActivity(request, "Status selbst gesetzt", `${body.key}: ${status ?? "automatisch"}`, email);
  return Response.json({ ok: true });
}
