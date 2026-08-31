// Freigabe des Newsletter-Versands. Der Cron verschickt nur eine Vorschau
// mit Freigabe-Link an den Betreiber; erst der Klick auf diesen Link (GET
// hierher, Auth über das signierte Token) löst den echten Versand aus.
//
// Idempotent: Ein zweiter Klick findet keine neuen Inhalte mehr (Wasserzeichen
// sind vorgerückt) und verschickt nichts doppelt.

import { verifyApproveToken } from "@/lib/email";
import { runFwNewsletter } from "@/lib/frameworkNewsletter";
import { runNewsletter } from "@/lib/newsletter";

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
  const kind = verifyApproveToken(url.searchParams.get("token") ?? "");
  if (!kind) {
    return page(
      "Link ungültig oder abgelaufen",
      `<p style="font-size:14px;color:#475569">Der Freigabe-Link ist ungültig oder älter als 7 Tage.
       Der nächste Cron-Lauf verschickt automatisch eine neue Vorschau mit frischem Link.</p>`,
      400,
    );
  }

  try {
    const report =
      kind === "updates"
        ? await runNewsletter({ approved: true })
        : await runFwNewsletter({ approved: true });
    const label = kind === "updates" ? "Update-Newsletter" : "Rahmenwerk-Newsletter";
    return page(
      "Versand freigegeben",
      `<p style="font-size:14px;color:#475569">${label}: <strong>${report.sent}</strong> von
       ${report.recipients} Abonnenten beliefert, ${report.skipped} ohne neue Inhalte übersprungen.
       ${report.errors.length ? `<br>Fehler: ${report.errors.length} (nächster Lauf versucht es erneut).` : ""}</p>
       <p style="font-size:13px;color:#94a3b8">Ein erneuter Klick verschickt nichts doppelt.</p>`,
    );
  } catch (e) {
    console.error("newsletter approve failed:", e);
    return page(
      "Versand fehlgeschlagen",
      `<p style="font-size:14px;color:#475569">${e instanceof Error ? e.message : "Unbekannter Fehler"}</p>`,
      500,
    );
  }
}
