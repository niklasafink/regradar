import { logActivity } from "@/lib/relevance/activity";
import { matchMany } from "@/lib/relevance/match";
import { rateLimit, resolveTarget, visitorProfile } from "@/lib/relevance/server";
import { scopeFor } from "@/lib/relevance/scopes";
import { UPDATE_PAGES } from "@/lib/updates";

// Ein KI-Abgleich mit Schiedsrichter kann 40–60 s dauern.
export const maxDuration = 120;

/* Einschlägigkeit für Updates ("u:<slug>") oder Rahmenwerke ("f:<id>").
   Profil: Konto > Vorprofil der Abonnenten-Domain > Entwurf aus dem Browser. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    keys?: string[]; profileId?: string; profile?: unknown; noLlm?: boolean; latest?: number; preview?: boolean;
  };
  // latest=N: die N neuesten analysierten Updates (Vorschau im Profil-Ablauf).
  const latestKeys = body.latest
    ? UPDATE_PAGES.filter((p) => p.u.url && scopeFor(p.u.url)).slice(0, Math.min(body.latest, 40)).map((p) => `u:${p.slug}`)
    : [];
  const keys = [...new Set([...latestKeys, ...(body.keys ?? []).filter((k) => typeof k === "string")])].slice(0, 40);
  const vp = await visitorProfile({ profileId: body.profileId, draft: body.profile, preferDraft: !!body.preview });
  if (!vp.profile) return Response.json({ profile: null, results: {} });
  const targets = keys.map(resolveTarget).filter((t) => t !== null);
  // Gäste und Vorprofile: begrenztes Tageskontingent für KI-Prüfungen;
  // darüber hinaus nur Regel- und Cache-Ergebnisse.
  const allowLlm = !body.noLlm && (vp.source === "konto" || (await rateLimit(request, "check", 150)));
  // Browser-Entwürfe von Gästen ändern sich laufend: kein Profil-Speicher,
  // nur der Cache nach Merkmalssignatur.
  const results = await matchMany(vp.profile, targets, {
    noLlm: !allowLlm, deadlineMs: 25_000, concurrency: 10, persist: vp.source !== "entwurf",
  });
  const label = { konto: "Status angezeigt", domain: "Status angezeigt (Vorprofil Domain)", entwurf: "Status angezeigt (Entwurf)" }[vp.source ?? "entwurf"];
  await logActivity(request, body.preview ? "Vorschau im Profil-Ablauf" : label, vp.profile.name);
  const titles = Object.fromEntries(targets.map((t) => [t.key, t.u ? { ti: t.u.ti.de, d: t.u.d, fw: t.fw.n.de } : { ti: t.fw.n.de, d: "", fw: "" }]));
  return Response.json({
    profile: { id: vp.profile.id, name: vp.profile.name, origin: vp.profile.origin },
    titles,
    source: vp.source,
    results,
  });
}
