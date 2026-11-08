import { exportLibrary, POLICY_LIBRARY, resolve, topicFor } from "@/lib/policy-context";

/* Kontext-Layer für Policies (Abnehmer: Conformis „Policy schreiben“).
   GET /api/policy-context                       → ganze Bibliothek samt Merkmalsregeln
   GET /api/policy-context?topic=Datenschutzrichtlinie&features=ki_crr,ki,lic_kredit
                                                 → aufgelöste Liste für ein Institut
   Öffentliche Stammdaten, keine Angaben über Nutzer. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const topicName = params.get("topic")?.trim();
  const headers = { "cache-control": "public, max-age=3600" };
  if (!topicName) return Response.json(exportLibrary(), { headers });
  const topic = topicFor(topicName);
  if (!topic) return Response.json({ topic: null, entries: [] }, { headers });
  const features = new Set((params.get("features") ?? "").split(",").map((f) => f.trim()).filter(Boolean));
  const locale = params.get("locale") === "en" ? "en" : "de";
  return Response.json(
    {
      format: POLICY_LIBRARY.format,
      topic: { id: topic.id, label: topic.l[locale] },
      entries: resolve(topic, features, locale),
    },
    { headers },
  );
}
