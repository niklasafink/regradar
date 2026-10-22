// Entscheidungsseite eines Radar-Punkts (Link aus der Checklisten-Mail).
//   GET  ?token=… → zeigt Punkt, Empfehlung, ggf. KI-Analyse und die Buttons
//                   (verändert nichts, Link-Scanner im Postfach sind harmlos)
//   POST ?token=… → Aktion aus dem Formular:
//     adopt     Empfehlung übernehmen       (open)
//     analyze   KI-Analyse anfordern        (open, failed)
//     implement Vorschlag der Analyse umsetzen (analyzed)
//     reassess  Einwand, KI bewertet neu    (analyzed)
//     skip      nichts tun                  (open, analyzed, failed)
//   Feld comment = Anweisung an die KI. Die Umsetzung macht der Stundenlauf.

import { htmlPage, formBody } from "@/lib/confirmPage";
import { radarTokenId, readItem, writeItem, type RadarItem } from "@/lib/radar";
import { radarPage } from "@/lib/radarPage";

const invalid = () =>
  htmlPage(
    "Link ungültig oder abgelaufen",
    `<p style="font-size:14px;color:#475569">Der Link ist ungültig oder älter als 30 Tage.</p>`,
    400,
  );

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const id = radarTokenId(token);
  if (!id) return invalid();
  const item = await readItem(id);
  if (!item) return htmlPage("Punkt nicht gefunden", "", 404);
  return radarPage(item, token);
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const id = radarTokenId(token);
  if (!id) return invalid();
  const item = await readItem(id);
  if (!item) return htmlPage("Punkt nicht gefunden", "", 404);

  const body = await formBody(request);
  const action = body.get("action") ?? "";
  const comment = (body.get("comment") ?? "").trim().slice(0, 2000);
  const at = new Date().toISOString();
  const next: RadarItem = { ...item, ...(comment ? { comment } : {}) };
  const s = item.status;
  let notice: string;

  if (action === "adopt" && s === "open" && item.recommendation) {
    next.status = "approved";
    next.decision = { at, code: item.recommendation.code, via: "recommendation" };
    notice = "Empfehlung übernommen. Der nächste Stundenlauf setzt sie um.";
  } else if (action === "analyze" && (s === "open" || s === "failed")) {
    next.status = "analysis_requested";
    notice = "Analyse angefordert. Du findest sie in spätestens einer Stunde unter demselben Link.";
  } else if (action === "implement" && s === "analyzed" && item.analysis) {
    next.status = "approved";
    next.decision = { at, code: item.analysis.code, via: "analysis" };
    notice = "Freigegeben. Der nächste Stundenlauf setzt den Vorschlag um.";
  } else if (action === "reassess" && s === "analyzed") {
    if (!comment) return radarPage(item, token, "Für eine Neubewertung bitte im Textfeld schreiben, was du anders siehst.");
    next.status = "analysis_requested";
    notice = "Einwand notiert. Die KI bewertet neu, das Ergebnis steht in spätestens einer Stunde hier.";
  } else if (action === "skip" && (s === "open" || s === "analyzed" || s === "failed")) {
    next.status = "dismissed";
    notice = "Notiert: Es passiert nichts.";
  } else {
    return radarPage(item, token, "Diese Aktion ist im aktuellen Status nicht möglich.");
  }

  await writeItem(next);
  return radarPage(next, token, notice);
}
