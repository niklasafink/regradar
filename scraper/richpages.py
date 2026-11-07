#!/usr/bin/env python3
"""Reiche Detailseiten für Regulatory-Radar-Meldungen (Prototyp).

Je Meldung: Live-Seite lesen, Quelltext laden und kürzen, EIN Sonnet-Aufruf
(claude -p, Abo-Kontingent, eigener Systemprompt, keine Werkzeuge, JSON-Schema),
regelbasierte Prüfung der Daten, HTML-Seite mit Strichgrafiken rendern.

Aufruf: python3 -I scraper/richpages.py OUTDIR TEMPLATE_HTML slug [slug ...]
Ergebnis: OUTDIR/work/<slug>/result.json; Übernahme nach web/lib/rich.json (Feld data + meta).
"""
import concurrent.futures as cf
import datetime as dt
import html
import json
import os
import re
import shutil
import subprocess
import sys

UA = "Mozilla/5.0 (compatible; regradar-richpages/0.1)"
BASE = "https://www.regradar.de"
SRC_CHARS = 18000          # ca. 5.000 Tokens Quelltext
TODAY = dt.date(2026, 11, 7)
MODEL = os.environ.get("RICH_MODEL", "sonnet")

SYSTEM = """Du bist Fachredakteur von Regulatory Radar (regradar.de), einem kostenlosen Dienst für Compliance-Officer in Finanzinstituten. Du schreibst aus einer Meldung und ihrem Quelltext die Inhalte einer Detailseite als JSON nach Schema.

Maßstab: Sicht eines Compliance-Officers. Was löst eine Handlungspflicht, Frist oder Prüfaufgabe aus? Hohe Flughöhe, keine Paragrafen-Exegese, Normen höchstens in Klammern.

Faktenregeln:
- Verwende nur Fakten aus SEITE und QUELLE. Nichts ergänzen, nichts aus dem Gedächtnis. Was nicht belegt ist, weglassen oder in open_points nennen.
- Jedes Datum im Format TT.MM.JJJJ und nur, wenn es in SEITE oder QUELLE steht.
- Ist die QUELLE leer oder dünn, bleibe knapp und nenne das in open_points.
- audience: wer ist betroffen (Institutsarten, Funktionen). status "nicht betroffen" nur, wenn die Quelle das ausdrücklich sagt oder der Anwendungsbereich es klar ausschließt.

Stil: Deutsch, kurze klare Sätze, aktiv. Englische Eigenbegriffe (DORA, MiCA, RTS, Q&A, T+1) bleiben. Keine Mittelpunkte als Trenner, keine Versalien, keine Gedankenstrich-Einschübe, keine Floskeln, kein Marketing. Antworte ausschließlich mit dem JSON."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["h1", "seo_title", "meta_description", "lead", "aka", "summary", "overview",
                 "facts", "audience", "changes", "todos", "timeline", "faq", "impact", "open_points"],
    "properties": {
        "h1": {"type": "string", "description": "Deutsche Überschrift, max. 90 Zeichen, mit Kernbegriff und offizieller Kennung in Klammern falls vorhanden"},
        "seo_title": {"type": "string", "description": "max. 60 Zeichen, Suchbegriff vorn"},
        "meta_description": {"type": "string", "description": "max. 155 Zeichen, Fakten zuerst"},
        "lead": {"type": "string", "description": "1 bis 2 Sätze: was, wer, ab wann"},
        "aka": {"type": "array", "items": {"type": "string"}, "maxItems": 5, "description": "Suchvarianten und Kennungen"},
        "summary": {"type": "string", "description": "eigenständige Kurzfassung mit 40 bis 60 Wörtern, zitierfähig"},
        "overview": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3, "description": "Absätze: worum es geht"},
        "facts": {"type": "array", "maxItems": 8, "items": {"type": "object", "additionalProperties": False,
                  "required": ["label", "value"], "properties": {"label": {"type": "string"}, "value": {"type": "string"}}}},
        "audience": {"type": "array", "minItems": 1, "maxItems": 6, "items": {"type": "object", "additionalProperties": False,
                     "required": ["name", "note", "detail", "status"], "properties": {
                         "name": {"type": "string", "description": "max. 18 Zeichen"},
                         "note": {"type": "string", "description": "max. 44 Zeichen"},
                         "detail": {"type": "string", "description": "max. 160 Zeichen, warum relevant"},
                         "status": {"type": "string", "enum": ["betroffen", "teilweise", "nicht betroffen"]}}}},
        "changes": {"type": "array", "minItems": 1, "maxItems": 6, "items": {"type": "object", "additionalProperties": False,
                    "required": ["ref", "title", "text"], "properties": {
                        "ref": {"type": "string", "description": "Fundstelle, max. 20 Zeichen, sonst leer"},
                        "title": {"type": "string", "description": "max. 40 Zeichen"},
                        "text": {"type": "string", "description": "max. 220 Zeichen"}}}},
        "todos": {"type": "array", "minItems": 1, "maxItems": 7, "items": {"type": "string"}},
        "timeline": {"type": "array", "maxItems": 6, "items": {"type": "object", "additionalProperties": False,
                     "required": ["date", "label", "kind"], "properties": {
                         "date": {"type": "string", "description": "TT.MM.JJJJ"},
                         "label": {"type": "string", "description": "max. 26 Zeichen"},
                         "kind": {"type": "string", "enum": ["schritt", "kern", "frist"]}}}},
        "faq": {"type": "array", "minItems": 2, "maxItems": 5, "items": {"type": "object", "additionalProperties": False,
                "required": ["q", "a"], "properties": {"q": {"type": "string"}, "a": {"type": "string", "description": "max. 350 Zeichen"}}}},
        "impact": {"type": "string", "enum": ["hoch", "mittel", "gering"]},
        "open_points": {"type": "array", "items": {"type": "string"}},
    },
}

MONTHS = {"januar": 1, "january": 1, "jan": 1, "februar": 2, "february": 2, "feb": 2, "märz": 3, "maerz": 3, "march": 3, "mar": 3,
          "april": 4, "apr": 4, "mai": 5, "may": 5, "juni": 6, "june": 6, "jun": 6, "juli": 7, "july": 7, "jul": 7,
          "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9, "oktober": 10, "october": 10, "oct": 10, "okt": 10,
          "november": 11, "nov": 11, "dezember": 12, "december": 12, "dec": 12, "dez": 12}


def sh(cmd, inp=None, timeout=120, env=None):
    r = subprocess.run(cmd, input=inp, capture_output=True, timeout=timeout, env=env)
    return r.returncode, r.stdout, r.stderr


def get(url, out=None):
    cmd = ["curl", "-sL", "--max-time", "40", "-A", UA, "-w", "%{http_code}", url]
    if out:
        cmd[1:1] = ["-o", out]
    rc, so, _ = sh(cmd, timeout=60)
    if out:
        return so.decode()[-3:]
    return so[:-3], so[-3:].decode()


def text_of(h):
    h = re.sub(r"(?is)<(script|style|nav|header|footer|noscript)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", html.unescape(h)).strip()


def extract_page(slug):
    raw, code = get(f"{BASE}/u/{slug}")
    t = raw.decode("utf-8", "ignore")
    body = re.sub(r"(?s)<script.*?</script>", "", t.split("<body", 1)[1])
    clean = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).replace("<!-- -->", "").strip()
    h1 = clean(re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S).group(1))
    date = re.search(r'<time dateTime="([^"]+)"', body).group(1)
    back = re.search(r'href="(/r/[^"]+/f/[^"]+)"[^>]*>.*?Alle Updates zu (?:<!-- -->)?(.*?)</a>', body, re.S)
    orig = re.search(r'href="([^"]+)"[^>]*data-fast-goal="original_link_click"', body)
    m = re.search(r'<div class="mt-5 space-y-3[^"]*">(.*?)</div>', body, re.S)
    summ = [clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", m.group(1), re.S)] if m else []
    pills = [html.unescape(x) for x in re.findall(r'<span class="rounded-full[^"]*">([^<]+)</span>', body)]
    return {"slug": slug, "status": code, "title": h1, "date": date,
            "fw_path": back.group(1) if back else "", "fw_name": clean(back.group(2)) if back else "",
            "orig": html.unescape(orig.group(1)) if orig else "", "summary": summ, "pills": pills[:4]}


def fetch_source(url, workdir):
    if not url:
        return "", "keine Quelle"
    f = os.path.join(workdir, "src.bin")
    code = get(url, f)
    if code != "200":
        return "", f"Quelle HTTP {code}"
    data = open(f, "rb").read()
    if data[:4] == b"%PDF":
        rc, so, _ = sh(["pdftotext", "-layout", f, "-"], timeout=60)
        txt = re.sub(r"[ \t]+", " ", so.decode("utf-8", "ignore"))
        txt = re.sub(r"\n\s*\n+", "\n", txt)
        kind = "PDF"
    else:
        raw = data.decode("utf-8", "ignore")
        txt = text_of(raw)
        kind = "HTML"
        if len(txt) < 2000:
            from urllib.parse import urljoin
            links = [html.unescape(l) for l in re.findall(r'["\'(=]([^"\'\s()<>]+\.pdf)', raw, re.I)]
            links = sorted(set(links), key=lambda l: ("files/20" not in l, len(l)))
            if links:
                pdf = urljoin(url, links[0])
                fp = os.path.join(workdir, "src2.pdf")
                if get(pdf, fp) == "200" and open(fp, "rb").read(4) == b"%PDF":
                    rc, so, _ = sh(["pdftotext", "-layout", fp, "-"], timeout=60)
                    ptxt = re.sub(r"[ \t]+", " ", so.decode("utf-8", "ignore"))
                    ptxt = re.sub(r"\n\s*\n+", "\n", ptxt)
                    txt = txt + "\n\nVERLINKTES PDF (" + pdf + "):\n" + ptxt
                    kind = "HTML + verlinktes PDF"
    return txt[:SRC_CHARS], f"{kind}, {len(txt)} Zeichen, gekürzt auf {min(len(txt), SRC_CHARS)}"


def dates_in(text):
    found = set()
    for d, m, y in re.findall(r"\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b", text):
        found.add((int(d), int(m), int(y)))
    for y, m, d in re.findall(r"\b(\d{4})-(\d{2})-(\d{2})\b", text):
        found.add((int(d), int(m), int(y)))
    for d, mon, y in re.findall(r"\b(\d{1,2})\.?\s+([A-Za-zäÄ]+)\.?\s+(\d{4})\b", text):
        if mon.lower() in MONTHS:
            found.add((int(d), MONTHS[mon.lower()], int(y)))
    for mon, d, y in re.findall(r"\b([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b", text):
        if mon.lower() in MONTHS:
            found.add((int(d), MONTHS[mon.lower()], int(y)))
    return found


def run_model(page, source, src_note):
    exe = shutil.which("claude")
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY")}
    env["MAX_THINKING_TOKENS"] = "0"
    user = ("SEITE (bestehende Detailseite auf regradar.de):\n" + json.dumps({
        "titel": page["title"], "datum": page["date"], "rahmenwerk": page["fw_name"], "kategorien": page["pills"],
        "zusammenfassung": page["summary"], "quelle_url": page["orig"]}, ensure_ascii=False, indent=1)
        + f"\n\nQUELLE ({src_note}):\n" + (source or "(nicht abrufbar)"))
    cmd = [exe, "-p", "--output-format", "json", "--model", MODEL, "--system-prompt", SYSTEM,
           "--json-schema", json.dumps(SCHEMA), "--tools", "", "--strict-mcp-config",
           "--setting-sources", "local", "--no-session-persistence", "--disable-slash-commands"]
    rc, so, se = sh(cmd, inp=user.encode(), timeout=600, env=env)
    if rc != 0:
        raise RuntimeError(f"claude -p Exit {rc}: {se.decode()[-400:]} {so.decode()[-400:]}")
    res = json.loads(so)
    data = res.get("structured_output")
    if data is None:
        txt = res.get("result", "")
        txt = txt[txt.find("{"): txt.rfind("}") + 1]
        data = json.loads(txt)
    u = res.get("usage", {})
    usage = {"input": u.get("input_tokens", 0), "cache_write": u.get("cache_creation_input_tokens", 0),
             "cache_read": u.get("cache_read_input_tokens", 0), "output": u.get("output_tokens", 0)}
    usage["total"] = sum(usage.values())
    usage["turns"] = res.get("num_turns")
    usage["iterations"] = len(u.get("iterations") or [])
    return data, usage


def check(data, page, source):
    """Regelbasierte QS: Daten, die nicht in Seite oder Quelle stehen, fliegen raus."""
    allowed = dates_in(source + " " + " ".join(page["summary"]) + " " + page["title"])
    y, m, d = page["date"].split("-")
    allowed.add((int(d), int(m), int(y)))
    dropped = []

    def ok_date(s):
        mm = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", s.strip())
        return bool(mm) and (int(mm.group(1)), int(mm.group(2)), int(mm.group(3))) in allowed

    keep = []
    for t in data["timeline"]:
        (keep if ok_date(t["date"]) else dropped).append(t if ok_date(t["date"]) else f"Zeitstrahl: {t['date']} {t['label']}")
    data["timeline"] = sorted(keep, key=lambda t: tuple(reversed([int(x) for x in t["date"].split(".")])))
    keepf = []
    for f in data["facts"]:
        ds = re.findall(r"\b\d{2}\.\d{2}\.\d{4}\b", f["value"])
        if all(ok_date(x) for x in ds):
            keepf.append(f)
        else:
            dropped.append(f"Eckdatum: {f['label']}: {f['value']}")
    data["facts"] = keepf
    # Stilregeln mechanisch absichern
    def fix(s):
        return s.replace(" · ", ", ").replace("·", ",").replace(" – ", ", ").replace(" — ", ", ")
    for k in ("h1", "seo_title", "meta_description", "lead", "summary"):
        data[k] = fix(data[k])
    data["overview"] = [fix(p) for p in data["overview"]]
    data["todos"] = [fix(p) for p in data["todos"]]
    for c in data["changes"]:
        c["text"] = fix(c["text"])
    for q in data["faq"]:
        q["a"] = fix(q["a"])
    return dropped


# ---------------------------------------------------------------- Rendering
E = lambda s: html.escape(str(s), quote=True)


def wrap(s, n):
    words, lines, cur = s.split(), [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > n and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


def svg_audience(aud, seed):
    n = len(aud)
    cols = min(3, n)
    rows = (n + cols - 1) // cols
    bw, bh, gap = 240, 128, 20
    W = 800
    x0 = (W - (cols * bw + (cols - 1) * gap)) / 2
    H = rows * (bh + gap) + 10
    out = [f'<svg class="sketch" data-seed="{seed}" viewBox="0 0 {W} {H}" role="img" aria-label="Für wen die Meldung relevant ist">']
    for i, a in enumerate(aud):
        r, c = divmod(i, cols)
        x, y = x0 + c * (bw + gap), 10 + r * (bh + gap)
        st = a["status"]
        cls = "sk acc" if st == "betroffen" else "sk"
        out.append(f'<rect class="{cls}" data-w="{2 if st == "betroffen" else 1.6}" x="{x:.0f}" y="{y}" width="{bw}" height="{bh}"/>')
        out.append(f'<g class="fig" data-x="{x + 34:.0f}" data-y="{y + 104}"></g>')
        tx = x + 66
        name = a["name"]
        fs = max(13, min(22, 160 / (max(len(name), 1) * 0.47)))
        out.append(f'<text class="t" x="{tx:.0f}" y="{y + 34}" style="font-size:{fs:.1f}px">{E(name)}</text>')
        for j, line in enumerate(wrap(a["note"], 21)[:2]):
            out.append(f'<text class="s" x="{tx:.0f}" y="{y + 58 + j * 20}">{E(line)}</text>')
        lab = {"betroffen": "betroffen", "teilweise": "teilweise betroffen", "nicht betroffen": "nicht betroffen"}[st]
        tcls = "acc-t" if st == "betroffen" else ("urg-t" if st == "nicht betroffen" else "")
        out.append(f'<text class="s {tcls}" x="{tx:.0f}" y="{y + 112}">{lab}</text>')
        if st == "nicht betroffen":
            out.append(f'<path class="sk urg" data-w="2.5" d="M {x + 16:.0f} {y + 44} L {x + 54:.0f} {y + 108}"/>')
            out.append(f'<path class="sk urg" data-w="2.5" d="M {x + 54:.0f} {y + 44} L {x + 16:.0f} {y + 108}"/>')
    out.append("</svg>")
    return "\n".join(out)


def svg_timeline(tl, seed):
    n = len(tl)
    xs = [70 + i * (660 / (n - 1)) for i in range(n)] if n > 1 else [400]
    out = [f'<svg class="sketch" data-seed="{seed}" viewBox="0 0 800 200" role="img" aria-label="Zeitstrahl">',
           '<path class="sk arrow" data-w="2" d="M 30 100 L 785 100"/>']
    for i, (t, x) in enumerate(zip(tl, xs)):
        k = t["kind"]
        cls = {"kern": "sk acc", "frist": "sk urg"}.get(k, "sk")
        r = 11 if k in ("kern", "frist") else 7
        out.append(f'<circle class="{cls}" data-fill="" data-w="2" cx="{x:.0f}" cy="100" r="{r}"/>')
        above = i % 2 == 0
        anchor, ax = "middle", x
        if i == 0 and n > 1:
            anchor, ax = "start", x - 30
        if i == n - 1 and n > 1:
            anchor, ax = "end", min(x + 40, 790)
        dy, ly = (58, 80) if above else (142, 164)
        tc = {"kern": " acc-t", "frist": " urg-t"}.get(k, "")
        out.append(f'<text class="t{tc}" x="{ax:.0f}" y="{dy}" text-anchor="{anchor}">{E(t["date"])}</text>')
        out.append(f'<text class="s" x="{ax:.0f}" y="{ly}" text-anchor="{anchor}">{E(t["label"][:28])}</text>')
    out.append('<text class="xs" x="785" y="192" text-anchor="end">nicht maßstabsgetreu</text>')
    out.append("</svg>")
    return "\n".join(out)


def ddmmyyyy(iso):
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}"


def render(page, data, tpl, seed):
    url = f"{BASE}/u/{page['slug']}"
    fw_url = BASE + page["fw_path"] if page["fw_path"] else BASE
    style = re.search(r"(?s)<style>.*?</style>", tpl).group(0)
    scripts = re.findall(r'(?s)<script src="https://cdn\.jsdelivr\.net/npm/roughjs@4\.6\.6/bundled/rough\.js"></script>.*', tpl)[0]
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "NewsArticle", "@id": url + "#article", "headline": data["h1"], "description": data["meta_description"],
         "abstract": data["summary"], "inLanguage": "de-DE", "datePublished": page["date"], "dateModified": TODAY.isoformat(),
         "isAccessibleForFree": True, "url": url, "mainEntityOfPage": url, "image": [BASE + "/og.png"],
         "author": {"@id": BASE + "/#organization"}, "publisher": {"@id": BASE + "/#organization"},
         "isBasedOn": page["orig"], "citation": [page["orig"]] if page["orig"] else [],
         "about": {"@type": "Thing", "name": page["fw_name"], "url": fw_url},
         "keywords": ", ".join(data["aka"]),
         "speakable": {"@type": "SpeakableSpecification", "cssSelector": ["h1", ".summary p"]},
         "audience": {"@type": "Audience", "audienceType": "Compliance-Officer in Finanzinstituten"}},
        {"@type": "Organization", "@id": BASE + "/#organization", "name": "Regulatory Radar", "url": BASE + "/",
         "logo": {"@type": "ImageObject", "url": BASE + "/apple-icon.png", "width": 180, "height": 180},
         "parentOrganization": {"@type": "Organization", "name": "Conformis", "url": "https://www.conformisgrc.com/"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Start", "item": BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": page["fw_name"], "item": fw_url},
            {"@type": "ListItem", "position": 3, "name": data["h1"], "item": url}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q["q"],
                                             "acceptedAnswer": {"@type": "Answer", "text": q["a"]}} for q in data["faq"]]}]}
    facts = [("Veröffentlicht", ddmmyyyy(page["date"]))] + [(f["label"], f["value"]) for f in data["facts"]]
    if page["orig"]:
        host = re.sub(r"^https?://(www\.)?", "", page["orig"]).split("/")[0]
    else:
        host = ""
    P = []
    P.append(f"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(data["seo_title"])}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{E(data["meta_description"])}">
<link rel="canonical" href="{E(url)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:site_name" content="Regulatory Radar"><meta property="og:locale" content="de_DE">
<meta property="og:url" content="{E(url)}"><meta property="og:title" content="{E(data["seo_title"])}"><meta property="og:description" content="{E(data["meta_description"])}">
<meta property="og:image" content="{BASE}/og.png"><meta property="article:published_time" content="{page["date"]}"><meta property="article:modified_time" content="{TODAY.isoformat()}">
<meta property="article:section" content="{E(page["fw_name"])}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Manrope:wght@500;600&family=Patrick+Hand&display=swap">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{style}
<style>body {{ margin: 0; }} :root {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }} [hidden] {{ display: none !important; }} img {{ max-width: 100%; }}</style>
</head><body>
<header class="top">
  <a class="mark" href="{BASE}"><b>regulatory</b> <i>radar</i></a>
  <a class="pill primary" href="{E(fw_url)}">Updates abonnieren →</a>
</header>
<main><article class="col">
<nav class="crumbs" aria-label="Brotkrumen"><a href="../index.html">← Alle Prototypen</a><span aria-hidden="true">/</span><a href="{BASE}">Start</a><span aria-hidden="true">/</span><a href="{E(fw_url)}">{E(page["fw_name"])}</a></nav>
<h1>{E(data["h1"])}</h1>
<p class="lead">{E(data["lead"])}</p>
<div class="byline"><span class="pill new">Wirkung {E(data["impact"])}</span><span>Veröffentlicht <time datetime="{page["date"]}">{ddmmyyyy(page["date"])}</time></span><span>Stand {TODAY.strftime("%d.%m.%Y")}</span>{f'<a href="{E(page["orig"])}" rel="noopener">Original: {E(host)} ↗</a>' if page["orig"] else ""}</div>
<p class="aka">Auch gesucht als: {E(", ".join(data["aka"]))}</p>
<section class="facts" aria-label="Eckdaten"><dl>
{"".join(f"<dt>{E(k)}</dt><dd>{E(v)}</dd>" for k, v in facts)}
</dl></section>
<section class="summary" aria-label="Kurzfassung"><h2>Kurz gesagt</h2><p>{E(data["summary"])}</p></section>
<h2 id="worum">Worum es geht</h2>
{"".join(f"<p>{E(p)}</p>" for p in data["overview"])}
<h2 id="betroffen">Für wen relevant</h2>
<figure><div class="sketch-wrap">{svg_audience(data["audience"], seed)}</div>
<figcaption>Betroffene nach der Meldung vom {ddmmyyyy(page["date"])}. Maßgeblich ist der Anwendungsbereich im Originaldokument.</figcaption></figure>
<div class="tbl"><table><thead><tr><th>Wer</th><th>Relevanz</th><th>Warum</th></tr></thead><tbody>
{"".join(f"<tr><td>{E(a['name'])}</td><td>{E(a['status'])}</td><td>{E(a['detail'])}</td></tr>" for a in data["audience"])}
</tbody></table></div>
<h2 id="aenderungen">Was sich ändert</h2>
<ul class="changes">{"".join(f'<li><span class="where">{E(c["ref"])}</span><div><b>{E(c["title"])}</b>{E(c["text"])}</div></li>' for c in data["changes"])}</ul>
<h2 id="todos">Was jetzt zu tun ist</h2>
<ol class="steps">{"".join(f"<li>{E(t)}</li>" for t in data["todos"])}</ol>
""")
    if len(data["timeline"]) >= 2:
        P.append(f"""<h2 id="zeitplan">Zeitplan</h2>
<figure><div class="sketch-wrap">{svg_timeline(data["timeline"], seed + 1)}</div>
<figcaption>Daten aus der Meldung und dem Originaldokument.</figcaption></figure>
""")
    P.append(f"""<h2 id="faq">Häufige Fragen</h2>
{"".join(f"<h3>{E(q['q'])}</h3><p>{E(q['a'])}</p>" for q in data["faq"])}
<h2 id="quellen">Quellen</h2>
<ol class="sources">{f'<li>Original: <a href="{E(page["orig"])}" rel="noopener">{E(host)}</a></li>' if page["orig"] else ""}<li>Regulatory Radar: <a href="{E(fw_url)}">{E(page["fw_name"])}</a></li><li>Bisherige Detailseite: <a href="{E(url)}">{E(url)}</a></li></ol>
</article>
<aside class="cta" aria-label="Updates"><p><strong>Keine Änderung zu {E(page["fw_name"][:60])} verpassen</strong>Regulatory Radar meldet neue Rundschreiben, Konsultationen und Fristen einmal pro Woche per E-Mail, kostenlos und ohne Paywall.</p><a class="pill primary" href="{E(fw_url)}">Kostenlos abonnieren →</a></aside>
<p class="ai">Hinweis zur Erstellung und Haftung: Dieser Beitrag wurde mit Unterstützung künstlicher Intelligenz aus dem verlinkten Originaldokument erstellt und regelbasiert geprüft (Stand {TODAY.strftime("%d.%m.%Y")}). Trotz sorgfältiger Prüfung können Fehler, Auslassungen oder zwischenzeitliche Rechtsänderungen nicht ausgeschlossen werden. Bitte hinterfragen Sie die Inhalte kritisch und prüfen Sie alle Angaben eigenverantwortlich anhand der Primärquellen, bevor Sie Entscheidungen darauf stützen. Der Beitrag dient ausschließlich der Information und ersetzt keine Rechtsberatung. Maßgeblich ist allein der Wortlaut der Originaldokumente.</p>
</main>
{scripts}
</body></html>
""")
    return "".join(P)


def process(slug, outdir, tpl, seed):
    wd = os.path.join(outdir, "work", slug[:60])
    os.makedirs(wd, exist_ok=True)
    page = extract_page(slug)
    source, note = fetch_source(page["orig"], wd)
    data, usage = run_model(page, source, note)
    dropped = check(data, page, source)
    json.dump({"page": page, "data": data, "usage": usage, "source_note": note, "dropped": dropped},
              open(os.path.join(wd, "result.json"), "w"), ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(outdir, "seiten"), exist_ok=True)
    fn = f"seiten/{slug[:80]}.html"
    open(os.path.join(outdir, fn), "w").write(render(page, data, tpl, seed))
    return {"slug": slug, "file": fn, "title": data["h1"], "usage": usage, "source_note": note,
            "dropped": dropped, "open_points": data["open_points"], "impact": data["impact"]}


def main():
    outdir, tplf, slugs = sys.argv[1], sys.argv[2], sys.argv[3:]
    tpl = open(tplf).read()
    results = {}
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(process, s, outdir, tpl, 10 + i * 3): s for i, s in enumerate(slugs)}
        for f in cf.as_completed(futs):
            s = futs[f]
            try:
                results[s] = f.result()
                print("ok", s, results[s]["usage"]["total"], flush=True)
            except Exception as e:  # noqa: BLE001
                results[s] = {"slug": s, "error": str(e)}
                print("FEHLER", s, e, flush=True)
    json.dump([results[s] for s in slugs], open(os.path.join(outdir, "summary.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
