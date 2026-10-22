// Entscheidungsseite zu einem Punkt der Radar-Checkliste (siehe radar.ts).
// Der Link aus der Mail (GET) zeigt nur diese Seite; Aktionen laufen per POST,
// damit Link-Scanner im Postfach nichts auslösen.

import { esc, htmlPage } from "./confirmPage";
import type { RadarItem, RadarLink, RadarStatus } from "./radar";

const KIND_LABEL = {
  dublette: "Mögliche Dublette",
  rahmenwerk: "Mögliches fehlendes Rahmenwerk",
  scraper: "Scraper-Kandidat",
} as const;

const STATUS_TEXT: Record<RadarStatus, string> = {
  open: "Offen",
  analysis_requested: "KI-Analyse angefordert, sie läuft im nächsten Stundenlauf (bis zu 60 Minuten).",
  analyzed: "KI-Analyse liegt vor, deine Freigabe fehlt.",
  approved: "Freigegeben, die Umsetzung läuft im nächsten Stundenlauf (bis zu 60 Minuten).",
  done: "Erledigt.",
  failed: "Umsetzung fehlgeschlagen.",
  dismissed: "Nichts unternommen.",
};

const pill = (name: string, label: string, primary = false) =>
  `<button type="submit" name="action" value="${name}" style="${
    primary
      ? "background:#0f172a;color:#fff;border:0;"
      : "background:#fff;color:#0f172a;border:1px solid #cbd5e1;"
  }padding:11px 22px;border-radius:9999px;font-weight:600;font-size:14px;cursor:pointer;margin:0 8px 8px 0">${esc(label)}</button>`;

const linkList = (links: RadarLink[]) =>
  links.length
    ? `<ul style="margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.6">${links
        .map((l) => `<li><a href="${esc(l.url)}" style="color:#0f172a">${esc(l.label || l.url)}</a></li>`)
        .join("")}</ul>`
    : "";

const section = (label: string, html: string) =>
  `<p style="margin:22px 0 4px;font-size:13px;color:#64748b">${esc(label)}</p>${html}`;

function actions(item: RadarItem, token: string): string {
  const form = (inner: string, hint: string) =>
    `<form method="post" action="/api/radar/item?token=${encodeURIComponent(token)}" style="margin:24px 0 0">
       <label style="font-size:13px;color:#64748b" for="c">${esc(hint)}</label>
       <textarea id="c" name="comment" rows="4" maxlength="2000" style="display:block;width:100%;box-sizing:border-box;margin:6px 0 14px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:14px"></textarea>
       ${inner}
     </form>`;
  if (item.status === "open" || item.status === "failed") {
    const rec = item.recommendation;
    return form(
      [
        rec && item.status === "open" ? pill("adopt", `Empfehlung übernehmen: ${rec.code}`, true) : "",
        pill("analyze", "KI-Analyse anfordern", !rec),
        pill("skip", "Nichts tun"),
      ].join(""),
      "Anweisung an die KI (optional, geht in die Analyse bzw. Umsetzung ein)",
    );
  }
  if (item.status === "analyzed") {
    return form(
      [
        pill("implement", `Vorschlag umsetzen: ${item.analysis?.code ?? ""}`, true),
        pill("reassess", "Sehe ich anders: KI neu bewerten lassen"),
        pill("skip", "Nichts tun"),
      ].join(""),
      "Anweisung oder Einwand an die KI (bei „umsetzen“ als Zusatz, bei „anders“ als Auftrag zur Neubewertung)",
    );
  }
  return "";
}

export function radarPage(item: RadarItem, token: string, notice?: string): Response {
  const rec = item.recommendation;
  const a = item.analysis;
  const body = [
    notice
      ? `<p style="background:#f1f5f9;border-radius:8px;padding:10px 14px;font-size:14px">${esc(notice)}</p>`
      : "",
    `<p style="margin:0;font-size:13px;color:#64748b">${KIND_LABEL[item.kind]}, Punkt ${item.nr}</p>`,
    `<p style="margin:4px 0 0;font-size:14px"><strong>Status:</strong> ${esc(STATUS_TEXT[item.status])}</p>`,
    item.detail ? section("Hintergrund", `<p style="margin:0;font-size:14px;line-height:1.6">${esc(item.detail)}</p>`) : "",
    section("Quellen", linkList(item.links)),
    rec
      ? section(
          "Empfehlung des LLM",
          `<p style="margin:0;font-size:14px;line-height:1.6"><strong>${esc(rec.code)}</strong>${
            rec.reason ? `: ${esc(rec.reason)}` : ""
          }</p>`,
        )
      : "",
    a
      ? section(
          "Detaillierte KI-Analyse",
          `<p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(a.proposal)}</p>
           <p style="margin:10px 0 0;font-size:14px"><strong>Vorschlag:</strong> ${esc(a.code)}</p>${linkList(a.links)}`,
        )
      : "",
    item.comment
      ? section("Deine letzte Anweisung", `<p style="margin:0;font-size:14px;white-space:pre-wrap">${esc(item.comment)}</p>`)
      : "",
    item.decision
      ? section("Entscheidung", `<p style="margin:0;font-size:14px"><strong>${esc(item.decision.code)}</strong></p>`)
      : "",
    item.result
      ? section(
          item.result.ok ? "Ergebnis der Umsetzung" : "Umsetzung fehlgeschlagen",
          `<p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(item.result.report)}</p>`,
        )
      : "",
    actions(item, token),
  ].join("");
  return htmlPage(item.title, body, 200, 640);
}
