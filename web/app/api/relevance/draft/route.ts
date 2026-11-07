import { draftProfile, manualProfile, questionsFor, type Profile } from "@/lib/relevance/profile";
import { rateLimit } from "@/lib/relevance/server";

/* Profil-Entwurf aus einem Registertreffer (inkl. Kurzrecherche) oder
   manuell aus gewählten Merkmalen (Institut ohne Registereintrag). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    registryId?: string; name?: string; facts?: Record<string, boolean>; research?: boolean;
  };
  if (!(await rateLimit(request, "draft", 15))) {
    return Response.json({ error: "Tageslimit für neue Profile erreicht." }, { status: 429 });
  }
  try {
    let profile: Profile;
    if (body.registryId) {
      profile = (await draftProfile(body.registryId, body.research !== false)).profile;
    } else if (body.name && body.facts) {
      profile = manualProfile(body.name, body.facts);
    } else {
      return Response.json({ error: "registryId oder name+facts fehlt" }, { status: 400 });
    }
    return Response.json({ profile, questions: questionsFor(profile) });
  } catch (e) {
    console.error("draft failed:", e);
    return Response.json({ error: "Profil konnte nicht erstellt werden." }, { status: 502 });
  }
}
