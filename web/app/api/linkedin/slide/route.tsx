// Slides des täglichen LinkedIn-Posts als PNG (1080×1080, quadratisch für
// die LinkedIn-Slideshow). GET ?day=YYYY-MM-DD&n=0 → Titel-Slide, n=1…N je
// Meldung, n=N+1 Abschluss. Inhalt aus lib/linkedin.ts, Regeln in LINKEDIN.md.
// Titel und Abschluss dunkel mit Radar-Motiv, Meldungen hell mit großer
// Nummer und Box „Kurz gesagt“. Nie Versalien (kein textTransform uppercase).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOGOS } from "@/components/authority-logo";
import { deDate, digestFor, windowLabel, type Digest } from "@/lib/linkedin";
import { authority } from "@/lib/logic";

export const runtime = "nodejs";

const S = 1080;
const C = {
  ink: "#0f172a",
  text: "#475569",
  muted: "#94a3b8",
  line: "#e2e8f0",
  soft: "#f1f5f9",
  blue: "#2563eb",
  nightText: "#cbd5e1",
  nightLine: "rgba(255,255,255,0.16)",
};

// Schriften, Logos und Icon bindet next.config.ts per outputFileTracingIncludes
// ein; turbopackIgnore verhindert, dass der Build das ganze Projekt mitnimmt.
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

/** Flaggen ohne Behördennamen: hier steht der Name zusätzlich daneben. */
const GENERIC = new Set(["eu.svg", "de.svg"]);

interface Logo { src: string; ratio: number; generic: boolean }

async function logo(srcDomain: string): Promise<Logo | null> {
  const file = LOGOS[srcDomain];
  if (!file) return null;
  const buf = await asset(`public/authorities/${file}`);
  const mime = file.endsWith(".png") ? "image/png" : "image/svg+xml";
  return {
    src: `data:${mime};base64,${buf.toString("base64")}`,
    ratio: ratio(file, buf),
    generic: GENERIC.has(file),
  };
}

/** Logo in einer festen Box, breite Wortmarken werden nicht riesig. */
function LogoImg({ l, h, maxW }: { l: Logo; h: number; maxW: number }) {
  const w = Math.min(maxW, Math.round(h * l.ratio));
  const hh = Math.round(w / l.ratio);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={l.src} width={w} height={hh} alt="" style={{ objectFit: "contain" }} />;
}

let ICON: string | null = null;
async function icon() {
  if (!ICON) ICON = `data:image/svg+xml;base64,${(await asset("app/icon.svg")).toString("base64")}`;
  return ICON;
}

/** Phosphor „ArrowRight“, Gewicht Bold (MIT), wie das Caret in der Navigation. */
function ArrowIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill={color}>
      <path d="M224.49,136.49l-72,72a12,12,0,0,1-17-17L187,140H40a12,12,0,0,1,0-24H187L135.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,224.49,136.49Z" />
    </svg>
  );
}

/** Radar-Ringe mit Sweep und blauem Blip als Hintergrund-Motiv (wie im Logo). */
function radarSvg(stroke: string, opacity: number) {
  const rings = [140, 260, 380, 500]
    .map((r) => `<circle cx="540" cy="540" r="${r}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="3"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs><linearGradient id="g" x1="540" y1="540" x2="894" y2="186" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${stroke}" stop-opacity="0"/><stop offset="1" stop-color="${stroke}" stop-opacity="${opacity * 1.6}"/>
    </linearGradient></defs>
    ${rings}
    <path d="M540 540 L894 186 A500 500 0 0 1 1040 540 Z" fill="url(#g)"/>
    <line x1="540" y1="540" x2="894" y2="186" stroke="${stroke}" stroke-opacity="${opacity * 2}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="540" cy="540" r="10" fill="${stroke}" fill-opacity="${opacity * 2.5}"/>
    <circle cx="690" cy="430" r="22" fill="${C.blue}"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function Radar({ dark, size, right, top }: { dark: boolean; size: number; right: number; top: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={radarSvg(dark ? "#ffffff" : C.ink, dark ? 0.13 : 0.06)}
      width={size} height={size} alt=""
      style={{ position: "absolute", right, top }}
    />
  );
}

/** Wortmarke „regulatory radar.de“ (DESIGN.md: regulatory fett, radar kursiv-leicht). */
function Brand({ iconSrc, size, dark }: { iconSrc: string; size: number; dark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSrc} width={size * 1.3} height={size * 1.3} alt=""
        style={dark ? { borderRadius: 999, border: "2px solid rgba(255,255,255,0.35)" } : {}} />
      <div style={{ display: "flex", fontSize: size, color: dark ? "#fff" : C.ink, letterSpacing: -0.5 }}>
        <span style={{ fontFamily: "Manrope", fontWeight: 700 }}>regulatory</span>
        <span style={{ fontFamily: "Inter", fontStyle: "italic", fontWeight: 400, color: dark ? C.nightText : C.text, marginLeft: size * 0.12 }}>radar</span>
        <span style={{ fontFamily: "Inter", fontWeight: 400, color: dark ? C.nightText : C.text }}>.de</span>
      </div>
    </div>
  );
}

function Pill({ children, blue, outline }: { children: React.ReactNode; blue?: boolean; outline?: boolean }) {
  const bg = blue ? C.blue : "#fff";
  return (
    <div style={{
      display: "flex", padding: "9px 24px", borderRadius: 999, fontSize: 25,
      fontFamily: "Inter", fontWeight: 500,
      background: outline ? "transparent" : bg,
      color: blue || outline ? "#fff" : C.ink,
      border: `2px solid ${outline ? "rgba(255,255,255,0.4)" : blue ? bg : C.line}`,
    }}>{children}</div>
  );
}

function Footer({ iconSrc, page, total, dark }: { iconSrc: string; page: number; total: number; dark?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      borderTop: `2px solid ${dark ? C.nightLine : C.line}`, paddingTop: 28,
    }}>
      <Brand iconSrc={iconSrc} size={26} dark={dark} />
      <div style={{ display: "flex", fontSize: 24, color: C.muted, fontFamily: "Inter" }}>
        {`${page} / ${total}`}
      </div>
    </div>
  );
}

const frame = (dark: boolean) => ({
  width: "100%", height: "100%", display: "flex", flexDirection: "column" as const,
  position: "relative" as const, overflow: "hidden" as const,
  background: dark ? C.ink : "#fff", padding: "72px 76px 60px",
  fontFamily: "Inter", color: dark ? "#fff" : C.ink,
});

/** „ESMA, EBA und EU-Amtsblatt“: Behörden der übrigen Meldungen, höchstens drei. */
function others(d: Digest): string {
  const names = [...new Set(d.items.slice(1).map((i) => authority(i.page.u.src)))];
  const shown = names.length > 3 ? [...names.slice(0, 2), "weiteren"] : names;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} und ${shown[shown.length - 1]}` : shown[0] ?? "";
}

// Titel-Slide: die wichtigste Meldung als konkrete Überschrift (im Jev-Vergleich
// klar vor Rubrik-Titeln wie „Regulatorik-Update für Finanzinstitute“), darunter
// die übrigen Meldungen als Ausblick und der Pfeil als Wisch-Hinweis.
function cover(d: Digest, iconSrc: string) {
  const n = d.items.length;
  const last = d.window[d.window.length - 1];
  const wd = (iso: string) => windowLabel([iso]).split(",")[0];
  // Montags deckt der Post Freitag bis Sonntag ab: beide Wochentage nennen.
  const date = d.window.length > 1
    ? `${wd(d.window[0])} bis ${wd(last)}, ${deDate(d.window[0]).slice(0, 6)} bis ${deDate(last)}`
    : windowLabel(d.window);
  const size = d.cover.length > 75 ? 66 : d.cover.length > 50 ? 80 : 92;
  const more = n === 1 ? "Die Meldung im Überblick"
    : `+ ${n - 1} ${n === 2 ? "weitere Meldung" : "weitere Meldungen"} von ${others(d)}`;
  return (
    <div style={frame(true)}>
      <Radar dark size={760} right={-330} top={-250} />
      <Brand iconSrc={iconSrc} size={30} dark />
      <div style={{ display: "flex", flexGrow: 1 }} />
      {/* Datum groß und fett: zeigt auf einen Blick, dass der Post tagesaktuell ist. */}
      <div style={{
        display: "flex", marginBottom: 22, color: "#fff",
        fontFamily: "Manrope", fontWeight: 700, fontSize: date.length > 30 ? 38 : 44, letterSpacing: -0.5,
      }}>{date}</div>
      <div style={{ display: "flex", fontSize: 34, color: "#60a5fa", fontWeight: 500, marginBottom: 24 }}>
        Regulatorik-Update für Finanzinstitute
      </div>
      <div style={{
        display: "flex", fontFamily: "Manrope", fontWeight: 700,
        fontSize: size, lineHeight: 1.05, letterSpacing: -3, maxWidth: 920,
      }}>{d.cover}</div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40,
        marginTop: 64, paddingTop: 36, borderTop: `2px solid ${C.nightLine}`,
      }}>
        {/* Wortweise ohne Umbruch innerhalb, sonst trennt Satori „EU-Amtsblatt“ am Bindestrich. */}
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 10, fontSize: 34, lineHeight: 1.3, color: C.nightText, maxWidth: 720 }}>
          {more.split(" ").map((w, i) => <span key={i} style={{ whiteSpace: "nowrap" }}>{w}</span>)}
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          width: 104, height: 104, borderRadius: 999, background: "#fff",
        }}>
          <ArrowIcon size={52} color={C.ink} />
        </div>
      </div>
    </div>
  );
}

async function itemSlide(d: Digest, idx: number, iconSrc: string) {
  const { page, kern } = d.items[idx];
  const u = page.u;
  const l = await logo(u.src);
  const ti = u.ti.de;
  const long = ti.length + kern.length;
  const tiSize = ti.length > 110 || long > 290 ? 38 : ti.length > 75 || long > 230 ? 43 : 50;
  const kernSize = long > 290 ? 27 : 30;
  const fw = page.fw.n.de.split(":")[0].trim();
  const nr = String(idx + 1).padStart(2, "0");
  return (
    <div style={frame(false)}>
      <Radar dark={false} size={640} right={-330} top={-300} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{
          display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: 168,
          lineHeight: 0.82, letterSpacing: -8, color: C.ink,
        }}>{nr}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 18, paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, minHeight: 72 }}>
            {l && <LogoImg l={l} h={l.generic ? 50 : 72} maxW={250} />}
            {(!l || l.generic) && (
              <div style={{ display: "flex", fontSize: 30, fontWeight: 500 }}>{authority(u.src)}</div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: C.muted }}>{u.d}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 34, flexShrink: 0 }}>
        <Pill>{u.t.de}</Pill>
        {u.imp === "high" && <Pill blue>Hohe Relevanz</Pill>}
      </div>
      <div style={{
        display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: tiSize,
        lineHeight: 1.14, letterSpacing: -1, marginTop: 26, flexShrink: 0,
      }}>{ti}</div>
      <div style={{ display: "flex", flexGrow: 1, minHeight: 24 }} />
      <div style={{
        display: "flex", flexDirection: "column", background: C.soft, borderRadius: 32,
        padding: "30px 38px", marginBottom: 32, flexShrink: 0,
      }}>
        <div style={{ display: "flex", fontSize: 23, color: C.blue, fontWeight: 500 }}>Kurz gesagt</div>
        <div style={{ display: "flex", fontSize: kernSize, lineHeight: 1.38, color: C.ink, marginTop: 10 }}>{kern}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 18 }}>
          {u.deadline && (
            <div style={{ display: "flex", fontSize: 23, fontWeight: 500, color: C.blue }}>{`Frist: ${u.deadline}`}</div>
          )}
          <div style={{ display: "flex", fontSize: 23, color: C.text }}>{`Rahmenwerk: ${fw}`}</div>
        </div>
      </div>
      <Footer iconSrc={iconSrc} page={idx + 2} total={d.slides} />
    </div>
  );
}

function endSlide(d: Digest, iconSrc: string) {
  return (
    <div style={frame(true)}>
      <Radar dark size={950} right={-500} top={-200} />
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{
        display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: 70,
        lineHeight: 1.08, letterSpacing: -2,
      }}>Alle Meldungen mit Zusammenfassung und Link zur Quelle</div>
      <div style={{ display: "flex", marginTop: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 42px", borderRadius: 999, background: "#fff", color: C.ink, fontSize: 38, fontWeight: 500 }}>
          regradar.de/updates
          <ArrowIcon size={36} color={C.ink} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 48 }}>
        {["Rechtsmonitoring", "Kostenlos", "Open Source"].map((t) => <Pill key={t} outline>{t}</Pill>)}
      </div>
      <div style={{ display: "flex", fontSize: 30, lineHeight: 1.45, color: C.nightText, marginTop: 34, marginBottom: 56 }}>
        Kostenloses Rechtsmonitoring als Open Source. Jeden Donnerstag die Meldungen der Woche zu Ihren Rahmenwerken per E-Mail.
      </div>
      <Footer iconSrc={iconSrc} page={d.slides} total={d.slides} dark />
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
  const iconSrc = await icon();
  const el = n === 0 ? cover(d, iconSrc)
    : n === d.slides - 1 ? endSlide(d, iconSrc)
    : await itemSlide(d, n - 1, iconSrc);
  return new ImageResponse(el, {
    width: S, height: S, fonts: await fonts(),
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
