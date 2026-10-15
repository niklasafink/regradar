// Vorschau des LinkedIn-Tagesposts im Look des LinkedIn-Feeds: Profilkopf,
// Text mit „… mehr“, Dokument-Karussell mit allen Slides zum Durchblättern,
// Reaktionsleiste und erster Kommentar. Genutzt von der Freigabe-Seite
// (/api/linkedin/approve, GET); der Freigabe-Button steht unter der Karte.
import type { Digest } from "./linkedin";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Post-Text wie im Feed: Hashtags und Links blau. */
const richText = (s: string) =>
  esc(s)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)#([0-9A-Za-zÄÖÜäöüß]+)/g, '$1<a class="tag">#$2</a>');

const ICON = {
  globe: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm4.9 6h-2a11 11 0 0 0-.9-3.9A5 5 0 0 1 12.9 7zM8 13c-.5-.6-1.3-2.2-1.4-5h2.8c-.1 2.8-.9 4.4-1.4 5zM6.6 7c.1-2.8.9-4.4 1.4-5 .5.6 1.3 2.2 1.4 5zM6 3.1A11 11 0 0 0 5.1 7h-2A5 5 0 0 1 6 3.1zM3.1 9h2a11 11 0 0 0 .9 3.9A5 5 0 0 1 3.1 9zM10 12.9a11 11 0 0 0 .9-3.9h2a5 5 0 0 1-2.9 3.9z"/></svg>',
  like: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11zM19 19h-1l-.73.37a6.14 6.14 0 01-2.69.63H7.72a1 1 0 01-1-.72l-.25-.87-.85-.41A1 1 0 015 17l.17-1-.76-.74A1 1 0 014.27 14l.66-1.09-.73-1.1a.49.49 0 01.08-.7.48.48 0 01.34-.11h7.05l-1.31-3.92A7 7 0 0110 4.86V3.75a.77.77 0 01.75-.75.75.75 0 01.71.51L12 5a9 9 0 002.13 3.5l4.5 4.5H19z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 9h10v1H7zm0 4h7v-1H7zm16-2a6.78 6.78 0 01-2.84 5.61L12 22v-4H8A7 7 0 018 4h8a7 7 0 017 7zm-2 0a5 5 0 00-5-5H8a5 5 0 000 10h6v2.28L19 15a4.79 4.79 0 002-4z"/></svg>',
  repost: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M13.96 5H6c-.55 0-1 .45-1 1v10H3V6c0-1.66 1.34-3 3-3h7.96L12 0h2.37L17 4l-2.63 4H12l1.96-3zm5.54 3H19v10c0 .55-.45 1-1 1h-7.96L12 16H9.63L7 20l2.63 4H12l-1.96-3H18c1.66 0 3-1.34 3-3V8h-1.5z"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 3L0 10l7.66 4.26L16 8l-6.26 8.34L14 24l7-21z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15 4l-8 8 8 8 1.4-1.4L9.8 12l6.6-6.6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9 4l8 8-8 8-1.4-1.4 6.6-6.6-6.6-6.6z"/></svg>',
};

export function previewHtml(d: Digest, opts: { name: string; action: string; when: string }): string {
  const slides = Array.from({ length: d.slides }, (_, n) =>
    `<img src="/api/linkedin/slide?day=${d.day}&amp;n=${n}" alt="Slide ${n + 1}" ${n > 1 ? 'loading="lazy"' : ""} draggable="false">`).join("");
  const avatar = (size: number) =>
    `<img class="av" src="/images/niklas.jpg" width="${size}" height="${size}" alt="">`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>LinkedIn-Post freigeben</title>
<style>
  :root{--bg:#f4f2ee;--card:#fff;--ink:rgba(0,0,0,.9);--muted:rgba(0,0,0,.6);--line:#e8e8e8;--blue:#0a66c2;--blue-h:#004182}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.43 -apple-system,system-ui,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  a{color:var(--blue);text-decoration:none} a:hover{text-decoration:underline}
  .top{background:#fff;border-bottom:1px solid var(--line);height:52px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;color:var(--muted)}
  .top b{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:4px;background:var(--blue);color:#fff;font:700 22px/1 Arial,sans-serif}
  main{max-width:555px;margin:24px auto 48px;padding:0 16px}
  .note{background:#fff;border-radius:8px;box-shadow:0 0 0 1px rgba(140,140,140,.2);padding:12px 16px;margin-bottom:8px;font-size:14px;color:var(--muted)}
  .note strong{color:var(--ink)}
  .card{background:var(--card);border-radius:8px;box-shadow:0 0 0 1px rgba(140,140,140,.2);overflow:hidden}
  .head{display:flex;gap:8px;padding:12px 16px 0}
  .av{border-radius:50%;object-fit:cover;flex:none;background:#ddd}
  .who{line-height:1.33;min-width:0}
  .who .n{font-weight:600;font-size:14px;color:var(--ink)}
  .who .d{font-size:12px;color:var(--muted)}
  .who .t{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px}
  .text{padding:8px 16px 0;white-space:pre-wrap;word-wrap:break-word;position:relative}
  .text.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .more{display:block;margin:0 16px;padding:0;border:0;background:none;color:var(--muted);font:inherit;cursor:pointer;text-align:right;width:calc(100% - 32px)}
  .more:hover{color:var(--blue);text-decoration:underline}
  .tag{color:var(--blue);font-weight:600}
  .doc{margin-top:8px;position:relative;background:#1d2226;user-select:none}
  .doc-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 16px;background:rgba(0,0,0,.75);color:#fff;font-size:14px}
  .doc-bar span:first-child{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .doc-bar span:last-child{flex:none;color:rgba(255,255,255,.75)}
  .view{overflow:hidden;aspect-ratio:1/1;position:relative}
  .track{display:flex;height:100%;transition:transform .35s cubic-bezier(.4,0,.2,1)}
  .track img{flex:0 0 100%;width:100%;height:100%;object-fit:contain;display:block;background:#fff}
  .nav{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;display:grid;place-items:center;cursor:pointer;transition:opacity .2s,background .2s}
  .nav:hover{background:rgba(0,0,0,.85)} .nav[disabled]{opacity:0;pointer-events:none}
  .nav.p{left:12px} .nav.n{right:12px}
  .prog{height:4px;background:rgba(255,255,255,.25)} .prog i{display:block;height:100%;background:#fff;transition:width .35s}
  .social{display:flex;justify-content:space-between;padding:8px 16px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);margin:0 0}
  .actions{display:flex;justify-content:space-around;padding:4px 8px}
  .actions span{display:flex;align-items:center;gap:6px;padding:10px 8px;border-radius:4px;font-weight:600;color:var(--muted);font-size:14px;cursor:default}
  .actions span:hover{background:rgba(0,0,0,.08)}
  .comments{padding:4px 16px 16px;border-top:1px solid var(--line)}
  .cm{display:flex;gap:8px;margin-top:12px}
  .bubble{background:#f2f2f2;border-radius:0 8px 8px 8px;padding:8px 12px;flex:1;min-width:0}
  .bubble .n{font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px}
  .badge{font-size:12px;font-weight:600;color:var(--muted);background:#e8e8e8;border-radius:4px;padding:0 4px}
  .bubble .d{font-size:12px;color:var(--muted);margin-bottom:6px}
  .bubble p{margin:0;white-space:pre-wrap;word-wrap:break-word}
  .approve{margin-top:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .btn{background:var(--blue);color:#fff;border:0;border-radius:24px;padding:10px 24px;font:600 16px/1.25 inherit;cursor:pointer}
  .btn:hover{background:var(--blue-h)}
  .pdf{font-weight:600;color:var(--muted)}
  @media (max-width:480px){main{padding:0;margin-top:8px}.card,.note{border-radius:0}.approve{padding:0 16px}.actions span{flex-direction:column;gap:2px;font-size:12px;padding:6px 4px}}
</style></head><body>
<div class="top"><b>in</b> Vorschau</div>
<main>
  <div class="note"><strong>So erscheint der Post am ${esc(opts.when)}.</strong> Gibst du erst danach frei, geht er sofort raus. Der erste Kommentar mit dem Link folgt automatisch.</div>
  <article class="card">
    <div class="head">${avatar(48)}
      <div class="who"><div class="n">${esc(opts.name)}</div>
        <div class="d">Regulatory Radar · regradar.de</div>
        <div class="t">Jetzt · ${ICON.globe}</div></div>
    </div>
    <div class="text clamp" id="txt">${richText(d.text)}</div>
    <button class="more" id="more" type="button">… mehr</button>
    <div class="doc" id="doc">
      <div class="doc-bar"><span>${esc(d.title)}</span><span id="count">1 / ${d.slides}</span></div>
      <div class="view">
        <div class="track" id="track">${slides}</div>
        <button class="nav p" id="prev" type="button" aria-label="Zurück">${ICON.prev}</button>
        <button class="nav n" id="next" type="button" aria-label="Weiter">${ICON.next}</button>
      </div>
      <div class="prog"><i id="bar"></i></div>
    </div>
    <div class="social"><span></span><span>1 Kommentar</span></div>
    <div class="actions"><span>${ICON.like}Gefällt mir</span><span>${ICON.comment}Kommentieren</span><span>${ICON.repost}Reposten</span><span>${ICON.send}Senden</span></div>
    <div class="comments">
      <div class="cm">${avatar(32)}
        <div class="bubble"><div class="n">${esc(opts.name)} <span class="badge">Verfasser</span></div>
          <div class="d">Regulatory Radar · regradar.de</div>
          <p>${richText(d.comment)}</p></div>
      </div>
    </div>
  </article>
  <form class="approve" method="post" action="${esc(opts.action)}">
    <input type="hidden" name="confirm" value="1">
    <button class="btn" type="submit">Ja, freigeben</button>
    <a class="pdf" href="/api/linkedin/pdf?day=${d.day}" target="_blank">Slideshow als PDF</a>
  </form>
</main>
<script>
(() => {
  const txt = document.getElementById("txt"), more = document.getElementById("more");
  if (txt.scrollHeight <= txt.clientHeight + 2) more.remove();
  more.onclick = () => { txt.classList.remove("clamp"); more.remove(); };
  const N = ${d.slides}, track = document.getElementById("track");
  const prev = document.getElementById("prev"), next = document.getElementById("next");
  const count = document.getElementById("count"), bar = document.getElementById("bar");
  let i = 0;
  const go = (k) => {
    i = Math.max(0, Math.min(N - 1, k));
    track.style.transform = "translateX(" + (-100 * i) + "%)";
    count.textContent = (i + 1) + " / " + N;
    bar.style.width = ((i + 1) / N * 100) + "%";
    prev.disabled = i === 0; next.disabled = i === N - 1;
  };
  prev.onclick = () => go(i - 1); next.onclick = () => go(i + 1);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(i - 1);
    if (e.key === "ArrowRight") go(i + 1);
  });
  let x0 = null;
  const view = track.parentElement;
  view.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  view.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
  });
  go(0);
})();
</script>
</body></html>`;
}
