// Prüft alle Seiten der Sitemap auf die SEO-Regeln aus lib/seo.ts:
// Titel 30–75 und Beschreibung 120–160 Zeichen, eindeutige Titel, Canonical,
// og:image, genau ein h1 und gültiges JSON-LD. Warnt nur, bricht nicht ab.
//   npm run seo:check                      (gegen http://localhost:3000)
//   npm run seo:check -- https://www.regradar.de

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, base));

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const warnings = [];
const titles = new Map();
let i = 0;
async function check(url) {
  const res = await fetch(url);
  const html = await res.text();
  const path = url.slice(base.length) || "/";
  const warn = (msg) => warnings.push(`${path}: ${msg}`);
  if (res.status !== 200) return warn(`Status ${res.status}`);
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  if (title.length < 30 || title.length > 75) warn(`Titel ${title.length} Zeichen: ${title}`);
  if (desc.length < 120 || desc.length > 160) warn(`Beschreibung ${desc.length} Zeichen`);
  if (!/<link rel="canonical"/.test(html)) warn("kein Canonical");
  if (!/property="og:image"/.test(html)) warn("kein og:image");
  if (/name="robots" content="[^"]*noindex/.test(html)) warn("noindex, steht aber in der Sitemap");
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) warn(`${h1} h1-Überschriften`);
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(json); } catch { warn("JSON-LD nicht parsebar"); }
  }
  titles.set(title, [...(titles.get(title) ?? []), path]);
}
const queue = [...urls];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) { await check(queue.shift()); i++; }
}));
for (const [t, paths] of titles) if (paths.length > 1) warnings.push(`Titel doppelt (${paths.length}×): ${t} → ${paths.slice(0, 3).join(", ")}`);

console.log(`${i} Seiten geprüft, ${warnings.length} Warnungen`);
for (const w of warnings.slice(0, 60)) console.log(`  ⚠ ${w}`);
if (warnings.length > 60) console.log(`  … und ${warnings.length - 60} weitere`);
