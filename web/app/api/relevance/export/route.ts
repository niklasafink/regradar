import { logActivity } from "@/lib/relevance/activity";
import { matchMany } from "@/lib/relevance/match";
import { relevanceWorkbook } from "@/lib/relevance/export";
import { allTargetKeys, resolveTarget, visitorProfile } from "@/lib/relevance/server";
import { slugify } from "@/lib/updates";

export const maxDuration = 60;

/* Excel-Export der Einschlägigkeit eines Kontoprofils, ein Blatt je
   Themengebiet. Nur gespeicherte Ergebnisse, Regeln und Cache: keine KI-Kosten. */
export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? undefined;
  const vp = await visitorProfile({ profileId });
  if (!vp.profile || vp.source !== "konto") {
    return Response.json({ error: "Bitte melden Sie sich an, um den Export zu nutzen." }, { status: 401 });
  }
  const p = vp.profile;
  const targets = allTargetKeys().map(resolveTarget).filter((t) => t !== null);
  const results = await matchMany(p, targets, { noLlm: true, concurrency: 20 });

  await logActivity(request, "Excel-Export", p.name);
  const bytes = relevanceWorkbook(p, results);
  const file = `Einschlaegigkeit-${slugify(p.name) || "profil"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
