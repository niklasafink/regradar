import { storedAll } from "@/lib/relevance/match";
import { visitorProfile } from "@/lib/relevance/server";

/* Alle festgehaltenen Ergebnisse des aktiven Kontoprofils in einem Abruf
   (gespeicherte Prüfungen und selbst gesetzte Status). Die Listen zeigen
   damit sofort den gespeicherten Stand, statt ihn paketweise nachzuladen.
   Keine KI, keine Kosten. Gäste und Vorprofile bekommen nichts. */
export async function GET() {
  const vp = await visitorProfile();
  if (!vp.profile || vp.source !== "konto") return Response.json({ profileId: null, results: {} });
  const all = await storedAll(vp.profile);
  // Nur was die Anzeige braucht; Kosten, Zeitstempel und Merkmale bleiben weg.
  const results = Object.fromEntries(Object.entries(all).map(([k, r]) => [k, {
    status: r.status, grund: r.grund, teile: r.teile, frage: r.frage, weitere: r.weitere, art: r.art,
    stufe: r.stufe, auto: r.auto, notiz: r.notiz,
  }]));
  return Response.json({ profileId: vp.profile.id, results }, { headers: { "Cache-Control": "no-store" } });
}
