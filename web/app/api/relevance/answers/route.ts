import { applyAnswers, questionsFor, sanitizeProfile } from "@/lib/relevance/profile";

/* Antworten aus dem Fragebogen übernehmen (ohne KI). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    profile?: unknown; answers?: Record<string, boolean | null>; bilanzsumme?: number | null;
  };
  const p = sanitizeProfile(body.profile);
  if (!p) return Response.json({ error: "Profil fehlt" }, { status: 400 });
  applyAnswers(p, body.answers ?? {}, body.bilanzsumme ?? null);
  return Response.json({ profile: p, questions: questionsFor(p) });
}
