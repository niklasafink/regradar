import { logActivity } from "@/lib/relevance/activity";
import { matchMany } from "@/lib/relevance/match";
import { relevanceWorkbook, type Col, type ExportScope } from "@/lib/relevance/export";
import { allTargetKeys, resolveTarget, visitorProfile } from "@/lib/relevance/server";
import { PROVIDERS } from "@/lib/base";
import { slugify } from "@/lib/updates";

export const maxDuration = 60;

/* Excel-Export der Einschlägigkeit eines Kontoprofils, ein Blatt je
   Themengebiet. Nur gespeicherte Ergebnisse, Regeln und Cache: keine KI-Kosten. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const profileId = params.get("profileId") ?? undefined;
  // ?status=ja,teilweise,nein,unsicher: nur diese Status (Filter auf „Alle Updates“).
  const COLS: Col[] = ["ja", "teilweise", "nein", "unsicher"];
  const picked = (params.get("status") ?? "").split(",").filter((x): x is Col => (COLS as string[]).includes(x));
  const only = picked.length && picked.length < COLS.length ? new Set(picked) : undefined;
  // Filter von „Alle Updates“: ?art=updates|praxis|alle, ?future=1, ?inst=<Provider-ID>
  const artParam = params.get("art");
  const inst = params.get("inst");
  const scope: ExportScope = {
    art: artParam === "praxis" || artParam === "alle" ? artParam : "updates",
    future: params.get("future") === "1",
    inst: inst && PROVIDERS.some((x) => x.id === inst) ? inst : undefined,
  };
  const vp = await visitorProfile({ profileId });
  if (!vp.profile || vp.source !== "konto") {
    return Response.json({ error: "Bitte melden Sie sich an, um den Export zu nutzen." }, { status: 401 });
  }
  const p = vp.profile;
  const targets = allTargetKeys().map(resolveTarget).filter((t) => t !== null);
  // Reine Praxis-Listen brauchen keine Einschlägigkeit
  const results = scope.art === "praxis" ? {} : await matchMany(p, targets, { noLlm: true, concurrency: 20 });

  await logActivity(request, "Excel-Export", only ? `${p.name} (${[...only].join(", ")})` : p.name);
  const bytes = relevanceWorkbook(p, results, only, scope);
  const file = `${scope.art === "praxis" ? "Aufsichtspraxis" : scope.future ? "Zukuenftige-Normen" : "Einschlaegigkeit"}-${slugify(p.name) || "profil"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
