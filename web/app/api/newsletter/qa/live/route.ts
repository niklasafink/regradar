// Live-QS auf Knopfdruck für den Update-Newsletter.
//   POST ?token=… (Formular von der Freigabe-Seite) → Auftrag einreihen, zeigt
//        eine Fortschrittsseite. Der minütliche Agent auf dem Mac startet die
//        QS (scraper/newsletter_qa.py --live); am Ende löst sie über
//        POST /api/newsletter/qa die neue Freigabe-Mail aus.
//   GET  ?token=…&status=1 → Stand als JSON (Poll der Fortschrittsseite)
//   GET  / PUT mit "Authorization: Bearer <CRON_SECRET>" → Agent liest den
//        Auftrag bzw. meldet { status, step }.

import { verifyApproveToken } from "@/lib/email";
import { formBody, htmlPage } from "@/lib/confirmPage";
import { readLive, writeLive, type LiveQa } from "@/lib/newsletterQa";

const STALE_MS = 45 * 60_000; // länger als die QS höchstens braucht

const agentAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
};

const active = (l: LiveQa | null) =>
  !!l && (l.status === "queued" || l.status === "running")
  && Date.now() - Date.parse(l.updatedAt) < STALE_MS;

export async function GET(request: Request) {
  if (agentAuthorized(request)) return Response.json({ live: await readLive() });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (verifyApproveToken(token) !== "updates") return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ live: await readLive(), now: new Date().toISOString() });
}

export async function PUT(request: Request) {
  if (!agentAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { status?: unknown; step?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const cur = await readLive();
  if (!cur) return Response.json({ error: "no_request" }, { status: 404 });
  const status = body.status;
  if (status !== "queued" && status !== "running" && status !== "done" && status !== "failed") {
    return Response.json({ error: "invalid_status" }, { status: 400 });
  }
  await writeLive({
    ...cur,
    status,
    step: typeof body.step === "string" ? body.step.slice(0, 300) : cur.step,
    updatedAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (verifyApproveToken(token) !== "updates") {
    return htmlPage("Link ungültig oder abgelaufen", "", 400);
  }
  const body = await formBody(request);
  if (body.get("confirm") !== "1") return htmlPage("Bestätigung fehlt", "", 400);

  // Läuft schon einer (Doppelklick), nur dessen Stand zeigen.
  if (!active(await readLive())) {
    const now = new Date().toISOString();
    await writeLive({ status: "queued", requestedAt: now, updatedAt: now, step: "Wartet auf den Start (maximal eine Minute)" });
  }

  const statusUrl = `/api/newsletter/qa/live?status=1&token=${encodeURIComponent(token)}`;
  return htmlPage(
    "QS-Lauf",
    `<p id="st" style="font-size:15px;line-height:1.6">Auftrag eingereiht …</p>
     <p id="hint" style="font-size:13px;color:#94a3b8">Die Seite aktualisiert sich von selbst. Du musst nichts weiter tun:
       Nach der QS kommt automatisch eine neue Freigabe-Mail mit dem aktuellen Bericht.</p>
     <script>
       const st = document.getElementById("st");
       const t0 = Date.now();
       async function poll() {
         try {
           const r = await fetch(${JSON.stringify(statusUrl)});
           const { live } = await r.json();
           if (live) {
             const s = live.step || "";
             if (live.status === "done") {
               st.innerHTML = "<strong>✓ QS fertig.</strong><br>" + s + "<br>Die neue Freigabe-Mail ist unterwegs.";
               return;
             }
             if (live.status === "failed") {
               st.innerHTML = "<strong style='color:#dc2626'>QS fehlgeschlagen.</strong><br>" + s;
               return;
             }
             st.innerHTML = "<span style='color:#94a3b8'>⏳ " + (live.status === "queued" ? "Wartet auf den Start" : "QS läuft") + " …</span><br>" + s;
           }
           if (Date.now() - t0 > 50 * 60000) { st.textContent = "Keine Rückmeldung. Läuft der Mac?"; return; }
         } catch {}
         setTimeout(poll, 2000);
       }
       poll();
     </script>`,
  );
}
