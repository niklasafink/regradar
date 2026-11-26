// Slides des täglichen LinkedIn-Posts als PNG (1600×1147, Querformat wie die
// App-Ansicht). GET ?day=YYYY-MM-DD&n=0 → Update-Liste der App mit rotem
// Rahmen um die Meldungen des Tages, n=1…N → Impact-Analyse je Meldung, zu der
// scraper/richpages.py eine erzeugt hat. Inhalt aus lib/linkedin.ts, Regeln in
// LINKEDIN.md. Nie Versalien (kein textTransform uppercase).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOGOS } from "@/components/authority-logo";
import { deDate, digestFor, impactSlides, type Digest } from "@/lib/linkedin";
import { IMPACT_LABEL, impactOf } from "@/lib/logic";
import type { RichUpdate } from "@/lib/rich";
import { UPDATE_PAGES, type UpdatePage } from "@/lib/updates";

export const runtime = "nodejs";

const W = 1600;
const H = 1147;
/** Maße sind für 1200 Pixel Breite entworfen; k rechnet auf die Slide-Breite um. */
const k = (n: number) => Math.round((n * W) / 1200);
const C = { ink: "#0f172a", text: "#334155", soft: "#64748b", line: "#e2e8f0", red: "#e11d48" };
const MAX_ROWS = 8;
const MAX_BOX_ROWS = 6;

// Schriften und Logos bindet next.config.ts per outputFileTracingIncludes ein;
// turbopackIgnore verhindert, dass der Build das ganze Projekt mitnimmt.
const asset = (p: string) => readFile(join(/* turbopackIgnore: true */ process.cwd(), p));

async function fonts() {
  const [m500, m700, i400, i500, i400i] = await Promise.all([
    asset("assets/fonts/manrope-latin-500-normal.woff"),
    asset("assets/fonts/manrope-latin-700-normal.woff"),
    asset("assets/fonts/inter-latin-400-normal.woff"),
    asset("assets/fonts/inter-latin-500-normal.woff"),
    asset("assets/fonts/inter-latin-400-italic.woff"),
  ]);
  return [
    { name: "Manrope", data: m500, weight: 500 as const, style: "normal" as const },
    { name: "Manrope", data: m700, weight: 700 as const, style: "normal" as const },
    { name: "Inter", data: i400, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: i500, weight: 500 as const, style: "normal" as const },
    { name: "Inter", data: i400i, weight: 400 as const, style: "italic" as const },
  ];
}

/** Seitenverhältnis aus SVG-Kopf (viewBox bzw. width/height) oder PNG-IHDR. */
function ratio(file: string, buf: Buffer): number {
  if (file.endsWith(".png")) return buf.readUInt32BE(16) / buf.readUInt32BE(20);
  const head = buf.subarray(0, 2000).toString("utf8");
  const vb = head.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/);
  if (vb) return Number(vb[1]) / Number(vb[2]);
  const w = head.match(/\swidth="([\d.]+)/);
  const h = head.match(/\sheight="([\d.]+)/);
  return w && h ? Number(w[1]) / Number(h[1]) : 2;
}

interface Logo { src: string; ratio: number }

async function logo(srcDomain: string): Promise<Logo | null> {
  const file = LOGOS[srcDomain];
  if (!file) return null;
  const buf = await asset(`public/authorities/${file}`);
  const mime = file.endsWith(".png") ? "image/png" : "image/svg+xml";
  return { src: `data:${mime};base64,${buf.toString("base64")}`, ratio: ratio(file, buf) };
}

function LogoImg({ l, h, maxW }: { l: Logo; h: number; maxW: number }) {
  const w = Math.min(maxW, Math.round(h * l.ratio));
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={l.src} width={w} height={Math.round(w / l.ratio)} alt="" style={{ objectFit: "contain" }} />;
}

let ICON: string | null = null;
async function icon() {
  if (!ICON) ICON = `data:image/svg+xml;base64,${(await asset("app/icon.svg")).toString("base64")}`;
  return ICON;
}

/** Wortmarke „regulatory radar“ (DESIGN.md: regulatory fett, radar kursiv-leicht). */
function Brand({ iconSrc, size }: { iconSrc: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSrc} width={size * 1.3} height={size * 1.3} alt="" />
      <div style={{ display: "flex", fontSize: size, color: C.ink, letterSpacing: -0.5 }}>
        <span style={{ fontFamily: "Manrope", fontWeight: 700 }}>regulatory</span>
        <span style={{ fontFamily: "Inter", fontStyle: "italic", fontWeight: 400, color: C.text, marginLeft: size * 0.12 }}>radar</span>
      </div>
    </div>
  );
}

/** Dunkle Pille mit der Domain, unten rechts auf jeder Slide. */
function Domain() {
  return (
    <div style={{
      display: "flex", position: "absolute", right: k(56), bottom: k(30), padding: `${k(8)}px ${k(26)}px`,
      borderRadius: 999, background: C.ink, color: "#fff", fontFamily: "Inter", fontWeight: 500, fontSize: k(21),
    }}>regulatoryradar.de</div>
  );
}

/** Handgezeichneter roter Pfeil nach rechts unten, zeigt auf den Rahmen. */
const ARROW = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="44" viewBox="0 0 64 44"><path d="M4 8 C26 6 38 16 44 32 M33 28 L44 36 L48 23" stroke="${C.red}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
).toString("base64")}`;

const slideTitle = (ti: string) => ti.replace(/\s*\((?=[^)]*\d)[^()\s]{12,}\)\s*$/, "");

/** Kürzt an einer Wortgrenze, damit ein Aufzählungspunkt höchstens zwei Zeilen belegt. */
const clip = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:.]+$/, "")} …`;

function Pill({ label, strong }: { label: string; strong: boolean }) {
  return (
    <div style={{
      display: "flex", flexShrink: 0, whiteSpace: "nowrap", padding: `${k(2)}px ${k(13)}px`, borderRadius: 999, fontFamily: "Inter", fontWeight: 500,
      fontSize: k(13), color: strong ? "#fff" : C.soft, background: strong ? C.ink : "#fff",
      border: `${Math.max(1, k(1))}px solid ${strong ? C.ink : "#cbd5e1"}`,
    }}>{label}</div>
  );
}

const impactLabel = (u: UpdatePage["u"]) => {
  const i = impactOf(u);
  return { text: `Impact: ${IMPACT_LABEL[i].de}`, strong: i === "high" };
};

/* ---------- Slide 1: Update-Liste ---------- */

/** Zeilen der Liste: ab der ersten Meldung des Zeitfensters, dann ältere zum Vergleich. */
function listRows(d: Digest): { inBox: UpdatePage[]; more: number; context: UpdatePage[] } {
  const days = new Set(d.window.map(deDate));
  const start = UPDATE_PAGES.findIndex((p) => days.has(p.u.d));
  const fresh = UPDATE_PAGES.slice(start).filter((p) => days.has(p.u.d));
  const shown = fresh.length > MAX_BOX_ROWS ? MAX_BOX_ROWS - 1 : fresh.length;
  const rowsUsed = shown + (fresh.length > shown ? 1 : 0);
  const after = UPDATE_PAGES.slice(start + fresh.length).slice(0, Math.max(0, MAX_ROWS - rowsUsed));
  return { inBox: fresh.slice(0, shown), more: fresh.length - shown, context: after };
}

const ROW_H = k(62);

function Row({ p, l }: { p: UpdatePage; l: Logo | null }) {
  const imp = impactLabel(p.u);
  return (
    <div style={{ display: "flex", alignItems: "center", height: ROW_H, borderBottom: `1px solid #f1f5f9` }}>
      <div style={{ display: "flex", width: k(88), flexShrink: 0, justifyContent: "flex-end", fontSize: k(13), color: C.soft }}>{p.u.d}</div>
      <div style={{ display: "flex", width: k(40), flexShrink: 0, justifyContent: "center", position: "relative", alignSelf: "stretch", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: k(20), width: 1, background: C.line }} />
        <div style={{ display: "flex", width: k(9), height: k(9), borderRadius: 999, background: "#2563eb" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minWidth: 0, marginRight: k(16) }}>
        <div style={{ display: "flex", alignItems: "center", gap: k(8), minWidth: 0 }}>
          {l && <LogoImg l={l} h={k(15)} maxW={k(44)} />}
          <div style={{
            display: "block", fontFamily: "Inter", fontWeight: 500, fontSize: k(17), color: C.ink,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "1 1 0",
          }}>{slideTitle(p.u.ti.de)}</div>
        </div>
        <div style={{
          display: "block", fontSize: k(13), color: C.soft, marginTop: k(1),
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{`${p.fw.n.de}, ${p.u.t.de}`}</div>
      </div>
      <Pill label={imp.text} strong={imp.strong} />
    </div>
  );
}

async function listSlide(d: Digest, iconSrc: string) {
  const { inBox, more, context } = listRows(d);
  const last = d.window[d.window.length - 1];
  const label = d.window.length > 1
    ? `Neu vom ${deDate(d.window[0]).slice(0, 6)} bis ${deDate(last)}`
    : `Neu vom ${deDate(d.window[0])}`;
  const boxRows = inBox.length + (more > 0 ? 1 : 0);
  const logos = new Map(await Promise.all([...inBox, ...context].map(async (p) => [p.slug, await logo(p.u.src)] as const)));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", position: "relative", fontFamily: "Inter", color: C.ink, padding: `${k(36)}px ${k(56)}px 0` }}>
      <Brand iconSrc={iconSrc} size={k(26)} />
      <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 500, fontSize: k(42), letterSpacing: -1, marginTop: k(26) }}>Alle Updates</div>
      {/* Datum in Rot mit Pfeil auf den Rahmen. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: k(10), height: k(70), color: C.red, fontFamily: "Inter", fontWeight: 500, fontSize: k(24) }}>
        {label}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ARROW} width={k(64)} height={k(44)} alt="" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        <div style={{
          position: "absolute", left: k(-12), right: k(-12), top: k(2), height: boxRows * ROW_H - k(4),
          border: `${k(3)}px solid ${C.red}`, borderRadius: k(14),
        }} />
        {inBox.map((p) => <Row key={p.slug} p={p} l={logos.get(p.slug) ?? null} />)}
        {more > 0 && (
          <div style={{ display: "flex", alignItems: "center", height: ROW_H, paddingLeft: k(128), fontSize: k(16), color: C.soft }}>
            {`+ ${more} weitere ${more === 1 ? "Meldung" : "Meldungen"} vom selben Zeitraum`}
          </div>
        )}
        {context.map((p) => <Row key={p.slug} p={p} l={logos.get(p.slug) ?? null} />)}
      </div>
      <Domain />
    </div>
  );
}

/* ---------- Slide 2…: Impact-Analyse ---------- */

const DEPT_WORDS = /compliance|risiko|meldewesen|revision|geschäftsleitung|recht|kunden|officer|fachbereich/i;
const WORKLOAD = { hoch: 0, mittel: 1, gering: 2 } as const;

/** „Bank, Asset Manager“ aus den Zielgruppen der Detailseite; Funktionsbezeichnungen gehören zu den Abteilungen. */
function affected(rich: RichUpdate): string {
  const pick = (status: string) =>
    rich.audience.filter((a) => a.status === status && !DEPT_WORDS.test(a.name)).map((a) => a.name);
  const names = pick("betroffen").length ? pick("betroffen") : pick("teilweise");
  return [...new Set(names)].slice(0, 4).join(", ");
}

function departments(rich: RichUpdate): string {
  const deps = [...(rich.impact_analysis?.departments ?? [])]
    .sort((a, b) => WORKLOAD[a.workload] - WORKLOAD[b.workload]);
  return [...new Set(deps.map((x) => x.name))].slice(0, 4).join(", ");
}

function Facts({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", fontSize: k(17), color: C.soft, marginTop: k(3) }}>
      <span style={{ marginRight: k(8) }}>{label}</span>
      <span style={{ fontFamily: "Manrope", fontWeight: 700, color: C.ink, fontSize: k(19) }}>{value}</span>
    </div>
  );
}

function Group({ title, item }: { title: string; item?: { name: string; change: string; steps?: string[] } }) {
  if (!item) return null;
  const bullets = [item.change, item.steps?.[0]].filter((x): x is string => !!x).map((x) => clip(x, 210));
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: k(14) }}>
      <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 500, fontSize: k(21), color: C.ink }}>{title}</div>
      <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: k(17), color: C.ink, margin: `${k(3)}px 0 0 ${k(20)}px` }}>{item.name}</div>
      {bullets.map((b) => (
        <div key={b} style={{ display: "flex", margin: `${k(3)}px 0 0 ${k(20)}px`, fontSize: k(16), lineHeight: 1.42, color: C.text }}>
          <div style={{ display: "flex", width: k(22), flexShrink: 0, justifyContent: "center" }}>•</div>
          <div style={{ display: "flex", flexGrow: 1, minWidth: 0 }}>{b}</div>
        </div>
      ))}
    </div>
  );
}

function impactSlide(page: UpdatePage, rich: RichUpdate) {
  const ia = rich.impact_analysis!;
  const imp = impactLabel(page.u);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", position: "relative", fontFamily: "Inter", color: C.text, padding: `${k(34)}px ${k(56)}px 0` }}>
      <div style={{ display: "flex", alignItems: "center", gap: k(12), fontSize: k(17), color: C.soft }}>
        {page.u.d}
        <Pill label={imp.text} strong={imp.strong} />
      </div>
      <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: k(25), lineHeight: 1.28, color: C.ink, marginTop: k(8), letterSpacing: -0.3 }}>
        {slideTitle(page.u.ti.de)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: k(10) }}>
        <Facts label="Betroffen:" value={affected(rich)} />
        <Facts label="Abteilungen:" value={departments(rich)} />
      </div>
      <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 500, fontSize: k(29), color: C.ink, letterSpacing: -0.5, marginTop: k(14), paddingTop: k(12), borderTop: `1px solid ${C.line}` }}>
        Impact-Analyse
      </div>
      <Group title="Kontrollen" item={ia.controls[0]} />
      <Group title="Prozesse" item={ia.processes[0]} />
      <Group title="Policies" item={ia.policies[0]} />
      <Domain />
    </div>
  );
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const day = sp.get("day") ?? "";
  const n = Number(sp.get("n") ?? "0");
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? digestFor(day) : undefined;
  if (!d || !Number.isInteger(n) || n < 0 || n >= d.slides)
    return new Response("Nicht gefunden", { status: 404 });
  const el = n === 0
    ? await listSlide(d, await icon())
    : (({ item, rich }) => impactSlide(item.page, rich))(impactSlides(d)[n - 1]);
  return new ImageResponse(el, {
    width: W, height: H, fonts: await fonts(),
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
