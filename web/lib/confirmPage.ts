// Kleine HTML-Seiten für Links aus E-Mails. Links in Mails werden von
// Sicherheits-Scannern (Microsoft Safe Links, Proofpoint, Mimecast …) oft
// automatisch per GET aufgerufen — teils Sekunden nach der Zustellung. Darum
// darf ein GET nie eine Aktion auslösen (Abmeldung, Rhythmuswechsel,
// Versandfreigabe): Er zeigt nur diese Seite mit einem Bestätigungs-Button,
// der die Aktion per POST-Formular aus dem Browser des Nutzers abschickt.

const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${esc(title)}</title>
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 16px;color:#0f172a">
      <p style="font-size:18px"><strong>regulatory</strong><em>radar</em></p>
      <h1 style="font-size:22px;font-weight:600">${esc(title)}</h1>
      ${body}
    </div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

/** Bestätigungsseite: Text + schwarzer Pill-Button (POST) + optionaler
    Zurück-Link. `fields` landen als Hidden-Felder im Formular. */
export function confirmPage(opts: {
  title: string;
  text: string;
  action: string;
  button: string;
  fields?: Record<string, string>;
  cancelHref?: string;
  cancelLabel?: string;
}): Response {
  const hidden = Object.entries(opts.fields ?? {})
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return htmlPage(
    opts.title,
    `<p style="font-size:14px;color:#475569;line-height:1.6">${opts.text}</p>
     <form method="post" action="${esc(opts.action)}" style="margin:24px 0 0">
       ${hidden}
       <button type="submit" style="display:inline-block;background:#0f172a;color:#fff;border:0;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:14px;cursor:pointer">${esc(opts.button)}</button>
       ${opts.cancelHref ? `<a href="${esc(opts.cancelHref)}" style="display:inline-block;margin-left:12px;color:#64748b;font-size:14px">${esc(opts.cancelLabel ?? "Abbrechen")}</a>` : ""}
     </form>`,
  );
}

/** Formular-/One-Click-Body eines POST lesen (x-www-form-urlencoded). */
export async function formBody(request: Request): Promise<URLSearchParams> {
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await request.formData();
      const p = new URLSearchParams();
      fd.forEach((v, k) => p.set(k, typeof v === "string" ? v : ""));
      return p;
    }
    return new URLSearchParams(await request.text());
  } catch {
    return new URLSearchParams();
  }
}
