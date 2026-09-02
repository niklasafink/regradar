// Freigabe des Newsletter-Versands. Der Cron verschickt nur eine Vorschau
// mit Freigabe-Link an den Betreiber; erst der Klick auf diesen Link (GET
// hierher, Auth über das signierte Token) löst den echten Versand aus.
//
// Der Klick antwortet sofort mit einer Fortschrittsseite; der Versand läuft
// nach der Antwort weiter (next/server `after`, gedrosselt auf <2 Mails/s
// wegen des Resend-Rate-Limits) und schreibt seinen Stand nach Redis. Die
// Seite pollt ihn hier über ?status=1.
//
// Doppelklick-sicher: Eine Redis-Lauf-Sperre lässt nur einen Versand
// gleichzeitig zu, und die Versandlogik selbst überspringt bereits
// belieferte Empfänger (Praxis: atomarer Claim im Monats-Set, Update/
// Rahmenwerk: Wasserzeichen pro Abonnent) — es geht nichts doppelt raus.

import { after } from "next/server";
import { APPROVE_LABEL, verifyApproveToken } from "@/lib/email";
import { runFwNewsletter } from "@/lib/frameworkNewsletter";
import { runNewsletter } from "@/lib/newsletter";
import { runPraxisNewsletter } from "@/lib/praxisNewsletter";
import { readProgress } from "@/lib/sendProgress";

export const maxDuration = 300;

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 16px;color:#0f172a">
      <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
      <h1 style="font-size:22px;font-weight:600">${title}</h1>
      ${body}
    </div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const kind = verifyApproveToken(token);
  if (!kind) {
    return page(
      "Link ungültig oder abgelaufen",
      `<p style="font-size:14px;color:#475569">Der Freigabe-Link ist ungültig oder älter als 7 Tage.
       Der nächste Cron-Lauf verschickt automatisch eine neue Vorschau mit frischem Link.</p>`,
      400,
    );
  }

  // Fortschritts-Poll der Statusseite (gleiches Token als Auth).
  if (url.searchParams.get("status") === "1") {
    return Response.json({
      progress: await readProgress(kind),
      now: new Date().toISOString(),
    });
  }

  // Versand NACH dem Absenden der Antwort starten. Läuft parallel schon
  // einer (zweiter Klick), scheitert er an der Lauf-Sperre und die Seite
  // zeigt einfach den Stand des aktiven Laufs.
  after(async () => {
    try {
      if (kind === "updates") await runNewsletter({ approved: true });
      else if (kind === "frameworks") await runFwNewsletter({ approved: true });
      else await runPraxisNewsletter({ approved: true });
    } catch (e) {
      console.error("newsletter approved send failed:", e);
    }
  });

  const label = APPROVE_LABEL[kind];
  const statusUrl = `/api/newsletter/approve?status=1&token=${encodeURIComponent(token)}`;
  return page(
    `${label}: Versand freigegeben`,
    `<p id="st" style="font-size:14px;color:#475569">Versand startet …</p>
     <p id="hint" style="font-size:13px;color:#94a3b8">Die Mails gehen gedrosselt raus
       (max. 2 pro Sekunde, Resend-Limit) — diese Seite aktualisiert sich von selbst.
       Bereits belieferte Abonnenten werden automatisch übersprungen, niemand erhält
       die Mail doppelt.</p>
     <script>
       const st = document.getElementById("st");
       const hint = document.getElementById("hint");
       const t0 = Date.now();
       let sawActive = false;
       function render(p, active) {
         const bits = [
           "<strong style='font-size:18px'>" + p.sent + "</strong> " +
             (p.sent === 1 ? "Mail" : "Mails") + " verschickt",
           (p.sent + p.skipped) + " von " + p.total + " Abonnenten verarbeitet",
         ];
         if (p.skipped > 0) bits.push(p.skipped + " übersprungen (bereits beliefert oder nichts Neues)");
         if (p.errors > 0) bits.push("<span style='color:#dc2626'>" + p.errors + " Fehler — nächster Klick auf den Freigabe-Link liefert nur die fehlenden nach</span>");
         st.innerHTML = bits.join("<br>") + "<br>" +
           (active
             ? "<span style='color:#94a3b8'>⏳ Versand läuft …</span>"
             : "<strong>✓ Versand abgeschlossen.</strong>");
         if (!active) hint.textContent = "Ein erneuter Klick auf den Freigabe-Link verschickt nichts doppelt.";
       }
       async function poll() {
         try {
           const r = await fetch(${JSON.stringify(statusUrl)});
           const { progress: p } = await r.json();
           if (p && !p.done) { sawActive = true; render(p, true); }
           else if (p && p.done) {
             // done-Stand eines FRÜHEREN Laufs nicht sofort als Ergebnis zeigen:
             // kurz warten, bis der eben gestartete Lauf schreibt (oder er hat
             // wirklich nichts zu tun, dann bleibt der alte Stand stehen).
             if (sawActive || Date.now() - t0 > 8000) { render(p, false); return; }
           } else if (Date.now() - t0 > 15000) {
             st.textContent = "Kein aktiver Versand — vermutlich gab es nichts (mehr) zu verschicken. Es wurde nichts doppelt versendet.";
             return;
           }
         } catch {}
         setTimeout(poll, 1200);
       }
       poll();
     </script>`,
  );
}
