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
LINKED_CHARS = int(os.environ.get("RICH_LINKED_CHARS", "40000"))  # verlinkte Dokumente (z. B. Rundschreiben) zusätzlich
SRC_CHARS = int(os.environ.get("RICH_SRC_CHARS", "40000"))  # 12000 im Stundenlauf: unter 20.000 Tokens je Meldung
TODAY = dt.date(2026, 11, 7)
MODEL = os.environ.get("RICH_MODEL", "sonnet")

SYSTEM = """Du bist Fachredakteur von Regulatory Radar (regradar.de), einem kostenlosen Dienst für Compliance-Officer in Finanzinstituten. Du schreibst aus einer Meldung und ihrem Quelltext die Inhalte einer Detailseite als JSON nach Schema.

Maßstab: Sicht eines Compliance-Officers. Was löst eine Handlungspflicht, Frist oder Prüfaufgabe aus? Normen nennst du mit Fundstelle, wenn Leser sie im Original nachschlagen müssen.

Tiefe (wichtigste Regel): Die Seite ersetzt für Leser das Lesen der Primärquelle. Schreibe ausführlich und konkret statt allgemein. Gib den Inhalt der QUELLE vollständig wieder: jede Änderung, jede Zahl, Schwelle, Frist, jedes Datum, jede Definition. Verweise nie nur auf „Details im Original“.
- Berichtigungen und Änderungsrechtsakte: Nenne in changes für jede einzelne Korrektur die Fundstelle (Seite, Artikel, Absatz), den früheren Wortlaut („vorher“) und den neuen Wortlaut („nachher“) wörtlich oder sinngemäß mit den konkret ersetzten Begriffen, dazu die Folge für die Praxis (materiell oder nur redaktionell, betrifft welche Pflicht). Gib zuerst Titel und Kennung des berichtigten Rechtsakts exakt so an, wie die QUELLE sie nennt; übernimm nie einen Gegenstand aus dem Gedächtnis oder aus dem Titel der SEITE, wenn die QUELLE etwas anderes sagt, und nenne Abweichungen in open_points.
- Normtexte, Leitlinien, Q&As: Hintergrund und Anlass, Anwendungsbereich, Kernpflichten mit Zahlen und Fristen, Übergangsregeln, Zusammenspiel mit anderen Regelwerken (jeweils nur, soweit in QUELLE oder SEITE belegt).
- Konsultationen und Entwürfe: Fragen, Frist, Stufe im Verfahren, geplanter Geltungsbeginn, was sich gegenüber dem geltenden Stand ändern soll.
- Quellenverweise: Die QUELLE besteht aus nummerierten Blöcken „[Q1] Bezeichnung | URL“. Belege jede inhaltliche Aussage in summary, overview, changes, outline, impact_analysis und faq mit dem Verweis [1], [2] oder [1, 3] direkt hinter dem Satz, passend zur Nummer des Blocks, aus dem sie stammt. Verweise nur auf vorhandene Blöcke. Aussagen, die nur aus SEITE stammen, bekommen keinen Verweis. Die Quellenliste erzeugt das System, schreibe sie nicht.
- summary („Kurz gesagt“): 3 bis 5 vollständige Sätze, jeder inhaltlich eigenständig und aussagekräftig: was gilt oder ändert sich konkret, für wen, mit welcher Folge oder Frist. Weniger Sätze, dafür dichter. Verboten sind Sätze ohne Aussage wie „Die Verordnung wurde im Februar 2025 veröffentlicht“, reine Veröffentlichungs- oder Adressatenangaben als eigener Satz und Aufzählungen von Fundstellen. Den Geltungsbereich hängst du, wenn nötig, an einen inhaltlichen Satz an. Kürze Fundstellen immer ab: Art., Abs., Buchst., Nr., Ziff., Anh., S. (z. B. „Art. 7 Abs. 1 Buchst. f Ziff. iv“), und lass Normverweise weg, wenn sie dem Leser nichts bringen.
- Jede Meldung, auch kurze: mindestens 800 Wörter Gesamtumfang, soweit die QUELLE das hergibt. Ist die QUELLE dünn, bleibe bei den belegten Fakten, erkläre in impact_analysis aber ausführlich, was daraus für Institute folgt, und nenne die Lücke in open_points.

Faktenregeln:
- Verwende nur Fakten aus SEITE und QUELLE. Nichts ergänzen, nichts aus dem Gedächtnis. Was nicht belegt ist, weglassen oder in open_points nennen.
- Jedes Datum im Format TT.MM.JJJJ und nur, wenn es in SEITE oder QUELLE steht.
- Ist die QUELLE leer oder dünn, bleibe knapp und nenne das in open_points.
- audience: nur Institutsgruppen (z. B. Banken, Kapitalverwaltungsgesellschaften, Wertpapierinstitute), keine Abteilungen oder Funktionen; Abteilungen gehören nur in impact_analysis.departments. status "nicht betroffen" nur, wenn die Quelle das ausdrücklich sagt oder der Anwendungsbereich es klar ausschließt.

Stil: Deutsch, kurze klare Sätze, aktiv. Englische Eigenbegriffe (DORA, MiCA, RTS, Q&A, T+1) bleiben. Keine Mittelpunkte als Trenner, keine Versalien, keine Gedankenstrich-Einschübe, keine Floskeln, kein Marketing. Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, kein Text davor oder danach) mit genau diesen Feldern:
h1 (max. 90 Zeichen, Kernbegriff, offizielle Kennung in Klammern), seo_title (30 bis 60 Zeichen, Suchbegriff vorn), meta_description (120 bis 155 Zeichen, Fakten zuerst), lead (1 bis 2 Sätze: was, wer, ab wann), aka (bis 5 Suchvarianten), summary (120 bis 220 Wörter, zitierfähig; bei Dokumenten mit Gliederung der gesamte Inhalt in Kurzform: Anlass, Adressaten, alle Themenblöcke in einem Halbsatz, Geltungsbeginn), overview (1 bis 2 Absätze), facts (bis 6 Objekte {label, value}), audience (1 bis 5 Objekte {name max. 18 Zeichen, note max. 44 Zeichen, detail max. 160 Zeichen, status "betroffen"|"teilweise"|"nicht betroffen"}), changes (3 bis 12 Objekte {ref max. 40 Zeichen oder leer, title max. 70 Zeichen, text max. 900 Zeichen: konkret, was neu gilt und was das Institut daraus ableiten muss, mit Zahlen, Schwellen, Fristen aus der Quelle}), todos (2 bis 5 Strings), timeline (0 bis 8 Objekte {date TT.MM.JJJJ, label max. 30 Zeichen, kind "schritt"|"kern"|"frist", slug optional}: die aktuelle Meldung als "kern"; nimm zusätzlich passende Einträge aus VERWANDTE MELDUNGEN auf (gleicher Regelungszusammenhang, z. B. Gesetz, Vorläufer, Konsultation, Parallelrundschreiben) mit deren slug, Datum und einem Kurzlabel; unpassende weglassen), outline (3 bis 10 Objekte {heading max. 90 Zeichen, items 2 bis 7 Strings je max. 360 Zeichen}: strukturierte Zusammenfassung entlang der Gliederung des Originaldokuments; übernimm dessen Kapitelüberschriften samt Nummerierung und liste unter jedem Kapitel die Neuerungen und Auslegungsaussagen als vollständige Sätze, sodass der Inhalt des Dokuments im Wesentlichen abgebildet ist; hat das Dokument keine Gliederung, gliedere nach Themen), faq (2 bis 4 Objekte {q, a max. 300 Zeichen}), impact ("hoch"|"mittel"|"gering"), open_points (bis 3 Strings), impact_analysis (Objekt mit vier Listen: controls 0 bis 6 Objekte {name max. 80 Zeichen, change max. 700 Zeichen, steps 3 bis 6 Strings je max. 420 Zeichen}, processes 0 bis 5 und policies 0 bis 4 gleich aufgebaut, departments 1 bis 6 Objekte {name max. 30 Zeichen, detail max. 240 Zeichen, workload "hoch"|"mittel"|"gering"}).
impact_analysis ersetzt die Handlungsliste und ist der Kern der Seite: controls = Kontrollen, die Institute anpassen oder neu aufsetzen müssen; processes = betroffene Geschäftsprozesse; policies = Richtlinien und Regelwerke, die zu ändern sind; departments = betroffene Abteilungen oder Funktionen. Konkret und ausführlich statt allgemein: lange, inhaltsreiche Sätze mit Gegenstand, Grund, Norm und Ergebnis, aus denen Leser alle Erkenntnisse mitnehmen können. name benennt den Gegenstand (z. B. „Abgleich Z02.00.a gegen Z02.00.b“), nicht eine Kategorie. change und jeder Eintrag in steps sind vollständige, eigenständig lesbare Sätze (Subjekt, Verb, Objekt), die als Stichpunkte unter dem Namen stehen: change sagt, was sich am Gegenstand ändert und warum (Wert, Feld, Verfahren, Frist); die steps nennen, was das Institut konkret tun muss, wer es tut und was als Ergebnis vorliegen soll. Wörter wie prüfen, beachten oder berücksichtigen nur mit konkretem Prüfgegenstand und Prüfergebnis. steps sind Umsetzungsempfehlungen, die sich aus QUELLE und SEITE ableiten; Zahlen, Fristen und Normen nur aus QUELLE und SEITE. Ist ein Bereich nicht ableitbar, Liste leer lassen statt zu raten.
Gesamtumfang 800 bis 4500 Wörter, je nach Umfang und Gehalt der QUELLE. Ist QUELLE ein langes Dokument, bilde es vollständig ab und lasse kein Kapitel aus. Die summary darf bei Änderungsrechtsakten und langen Dokumenten bis 260 Wörter lang sein."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["h1", "seo_title", "meta_description", "lead", "aka", "summary", "overview",
                 "facts", "audience", "changes", "todos", "timeline", "faq", "impact", "open_points", "impact_analysis"],
    "properties": {
        "h1": {"type": "string", "description": "Deutsche Überschrift, max. 90 Zeichen, mit Kernbegriff und offizieller Kennung in Klammern falls vorhanden"},
        "seo_title": {"type": "string", "description": "max. 60 Zeichen, Suchbegriff vorn"},
        "meta_description": {"type": "string", "description": "max. 155 Zeichen, Fakten zuerst"},
        "lead": {"type": "string", "description": "1 bis 2 Sätze: was, wer, ab wann"},
        "aka": {"type": "array", "items": {"type": "string"}, "maxItems": 5, "description": "Suchvarianten und Kennungen"},
        "summary": {"type": "string", "description": "eigenständige Kurzfassung mit 100 bis 160 Wörtern, zitierfähig"},
        "outline": {"type": "array", "maxItems": 10, "items": {"type": "object", "additionalProperties": False,
                    "required": ["heading", "items"], "properties": {"heading": {"type": "string"}, "items": {"type": "array", "items": {"type": "string"}}}}},
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
        "impact_analysis": {"type": "object", "additionalProperties": False,
                            "required": ["controls", "processes", "policies", "departments"], "properties": {
            "controls": {"type": "array", "maxItems": 5, "items": {"type": "object", "additionalProperties": False,
                         "required": ["name", "change", "steps"], "properties": {
                             "name": {"type": "string", "description": "max. 70 Zeichen, konkreter Gegenstand"},
                             "change": {"type": "string", "description": "max. 400 Zeichen, ganzer Satz: was sich konkret ändert und warum"},
                             "steps": {"type": "array", "minItems": 3, "maxItems": 5, "items": {"type": "string", "description": "ganzer Satz, max. 260 Zeichen"}}}}},
            "processes": {"type": "array", "maxItems": 5, "items": {"type": "object", "additionalProperties": False,
                         "required": ["name", "change", "steps"], "properties": {
                             "name": {"type": "string", "description": "max. 70 Zeichen, konkreter Gegenstand"},
                             "change": {"type": "string", "description": "max. 400 Zeichen, ganzer Satz: was sich konkret ändert und warum"},
                             "steps": {"type": "array", "minItems": 3, "maxItems": 5, "items": {"type": "string", "description": "ganzer Satz, max. 260 Zeichen"}}}}},
            "policies": {"type": "array", "maxItems": 4, "items": {"type": "object", "additionalProperties": False,
                         "required": ["name", "change", "steps"], "properties": {
                             "name": {"type": "string", "description": "max. 70 Zeichen, konkreter Gegenstand"},
                             "change": {"type": "string", "description": "max. 400 Zeichen, ganzer Satz: was sich konkret ändert und warum"},
                             "steps": {"type": "array", "minItems": 3, "maxItems": 5, "items": {"type": "string", "description": "ganzer Satz, max. 260 Zeichen"}}}}},
            "departments": {"type": "array", "maxItems": 6, "items": {"type": "object", "additionalProperties": False,
                            "required": ["name", "detail", "workload"], "properties": {
                                "name": {"type": "string", "description": "max. 30 Zeichen"},
                                "detail": {"type": "string", "description": "max. 200 Zeichen, was dort zu tun ist"},
                                "workload": {"type": "string", "enum": ["hoch", "mittel", "gering"]}}}},
        }},
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


def related_updates(slug, days=150, limit=8):
    """Andere Meldungen desselben Rahmenwerks im Umkreis (aus live.json), für den Zeitplan."""
    try:
        live = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "lib", "live.json"), encoding="utf-8"))["updates"]
    except (OSError, ValueError, KeyError):
        return []
    fw = max((k for k in live if slug.startswith(k + "-")), key=len, default=None)
    if not fw:
        return []
    def iso(dmy):
        d, m, y = dmy.split(".")
        return dt.date(int(y), int(m), int(d))
    mine = next((u for u in live[fw] if f"{fw}-{iso(u['d']).isoformat()}-{u['sl']}" == slug), None)
    if not mine:
        return []
    out = []
    for u in live[fw]:
        s2 = f"{fw}-{iso(u['d']).isoformat()}-{u['sl']}"
        if s2 == slug or abs((iso(u["d"]) - iso(mine["d"])).days) > days:
            continue
        out.append({"date": u["d"], "titel": u["ti"]["de"], "slug": s2, "_k": abs((iso(u["d"]) - iso(mine["d"])).days)})
    out.sort(key=lambda r: r["_k"])
    return [{k: v for k, v in r.items() if k != "_k"} for r in out[:limit]]


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
    related = related_updates(slug)
    return {"slug": slug, "related": related, "status": code, "title": h1, "date": date,
            "fw_path": back.group(1) if back else "", "fw_name": clean(back.group(2)) if back else "",
            "orig": html.unescape(orig.group(1)) if orig else "", "summary": summ, "pills": pills[:4]}


DOC_CHARS = int(os.environ.get("RICH_DOC_CHARS", "70000"))  # Hauptdokument (z. B. Konsultationspapier)
_DOC_SKIP = re.compile(r"record.of.processing|privacy|datenschutz|data.protection|cookie|legal.notice|impressum|template|form(ular)?\b", re.I)
_DOC_PREF = re.compile(r"consultation|guideline|final.report|draft|opinion|rts|its|report|leitlinien|rundschreiben|entwurf", re.I)


def _pdf_text(path):
    rc, so, _ = sh(["pdftotext", "-layout", path, "-"], timeout=90)
    t = re.sub(r"[ \t]+", " ", so.decode("utf-8", "ignore"))
    return re.sub(r"\n\s*\n+", "\n", t)


def _label_of(url, fallback):
    from urllib.parse import unquote, urlparse, parse_qs
    q = parse_qs(urlparse(url).query).get("filename")
    name = unquote(q[0]) if q else unquote(urlparse(url).path.rsplit("/", 1)[-1])
    name = re.sub(r"\.(pdf|html?|docx?)$", "", name, flags=re.I).replace("_", " ").strip()
    return name or fallback


def _page_documents(url, raw, workdir, limit=2):
    """Haupt-Dokumente einer Seite (PDF-Downloads wie Consultation Paper, Final Report): [(url, label, text)]."""
    from urllib.parse import urljoin
    cands = []
    for h in re.findall(r'href=["\']([^"\'#]+)', raw):
        h = html.unescape(h)
        low = h.lower()
        if not (".pdf" in low or "/document/download" in low or "/files/" in low and "download" in low):
            continue
        u = urljoin(url, h)
        lab = _label_of(u, "Dokument")
        if _DOC_SKIP.search(lab) or u in [c[0] for c in cands]:
            continue
        cands.append((u, lab))
    cands.sort(key=lambda c: (0 if _DOC_PREF.search(c[1]) else 1))
    out = []
    for i, (u, lab) in enumerate(cands[:limit]):
        f = os.path.join(workdir, f"doc{i}.bin")
        if get(u, f) != "200" or open(f, "rb").read(4) != b"%PDF":
            continue
        t = _pdf_text(f)
        if len(t) > 800 and not _DOC_SKIP.search(t[:400]):
            out.append((u, lab, t))
    return out


_ABBR = {"AMLR": "32024R1624", "DORA": "32022R2554", "MiCAR": "32023R1114", "MiCA": "32023R1114",
         "CRR": "32013R0575", "SFDR": "32019R2088", "AI Act": "32024R1689", "AMLD6": "32024L1640"}


def _legal_excerpts(text, limit_each=6000, max_arts=5):
    """Zitierte Artikel des am häufigsten mit Artikelnummer genannten Rechtsakts (EUR-Lex, englisch) als Belegtext.
    Nur bei eindeutiger Zuordnung: 'Art. N <Kürzel>' oder 'Article N of Regulation (EU) Y/Z'."""
    from collections import defaultdict
    head = text[:80000]
    found = defaultdict(list)  # celex -> Artikelnummern
    for m in re.finditer(r"Art(?:icles?|s?\.)\s+(\d{1,3})(?:\([^)]*\))?(?:[^.;\n]{0,40}?)\s(?:of\s+(?:the\s+)?)?(" + "|".join(map(re.escape, _ABBR)) + r")\b", head):
        found[_ABBR[m.group(2)]].append(int(m.group(1)))
    for m in re.finditer(r"Art(?:icles?|s?\.)\s+(\d{1,3})(?:\([^)]*\))?[^.;\n]{0,40}?(?:of\s+(?:the\s+)?)?Regulation \(EU\) (\d{4})/(\d{1,4})", head):
        found[f"3{m.group(2)}R{int(m.group(3)):04d}"].append(int(m.group(1)))
    if not found:
        return None
    celex = max(found, key=lambda k: len(found[k]))
    url = f"https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex}"
    raw, code = get(url)
    if code != "200":
        return None
    t = text_of(raw.decode("utf-8", "ignore"))
    if len(t) < 5000:
        return None
    arts = []
    for a in found[celex]:
        if a not in arts:
            arts.append(a)
    parts = []
    for a in arts[:max_arts]:
        m = re.search(rf"Article {a}\s+(?=[A-Z])", t)
        if not m:
            continue
        m2 = re.search(rf"Article {a + 1}\s+(?=[A-Z])", t[m.end():])
        end = m.end() + (m2.start() if m2 else limit_each)
        parts.append(t[m.start():min(end, m.start() + limit_each)])
    if not parts:
        return None
    return f"Rechtsakt {celex[1:5]}/{int(celex[6:]) if celex[5]=='R' else celex[5:]}, zitierte Artikel (EUR-Lex)", url, "\n".join(parts)


def fetch_source(url, workdir):
    """Quelltext mit nummerierten Blöcken: '[Qn] Bezeichnung | URL' leitet jeden Beleg ein."""
    if not url:
        return "", "keine Quelle"
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from regradar.fulltext import eurlex_text_url
        url = eurlex_text_url(url)  # EUR-Lex: Rechtstext statt Metadatenseite
    except Exception:  # noqa: BLE001
        pass
    f = os.path.join(workdir, "src.bin")
    code = get(url, f)
    if code != "200":
        return "", f"Quelle HTTP {code}"
    data = open(f, "rb").read()
    blocks = []  # (label, url, text)
    kind = "HTML"
    raw = ""
    if data[:4] == b"%PDF":
        blocks.append(("Originaldokument (PDF)", url, _pdf_text(f)))
        kind = "PDF"
    else:
        raw = data.decode("utf-8", "ignore")
        main = text_of(raw)
        blocks.append(("Originalmeldung, " + re.sub(r"^www\.", "", url.split("/")[2]), url, main))
        if len(main) < 2000:
            links = [html.unescape(l) for l in re.findall(r'["\'(=]([^"\'\s()<>]+\.pdf)', raw, re.I)]
            links = sorted(set(links), key=lambda l: ("files/20" not in l, len(l)))
            if links:
                from urllib.parse import urljoin
                pdf = urljoin(url, links[0])
                fp = os.path.join(workdir, "src2.pdf")
                if get(pdf, fp) == "200" and open(fp, "rb").read(4) == b"%PDF":
                    blocks.append((_label_of(pdf, "Verlinktes PDF"), pdf, _pdf_text(fp)))
                    kind = "HTML + verlinktes PDF"
        try:
            for u, lab, t in _page_documents(url, raw, workdir):
                if all(u != b[1] for b in blocks):
                    blocks.append((lab, u, t))
        except Exception:  # noqa: BLE001
            pass
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from regradar.fulltext import linked_docs
            for l, t in linked_docs(url, LINKED_CHARS):
                if all(l != b[1] for b in blocks) and not _DOC_SKIP.search(t[:400]):
                    blocks.append((_label_of(l, "Verlinktes Dokument"), l, t))
        except Exception:  # noqa: BLE001
            pass
    try:
        lg = _legal_excerpts(" ".join(b[2] for b in blocks))
        if lg:
            blocks.append(lg)
    except Exception:  # noqa: BLE001
        pass
    out, total = [], 0
    for i, (lab, u, t) in enumerate(blocks, 1):
        cap = DOC_CHARS if i == 1 and len(blocks) == 1 else (SRC_CHARS if i == 1 else DOC_CHARS if len(t) > 20000 else LINKED_CHARS)
        if i == 1 and len(blocks) > 1:
            cap = min(len(t), 6000)
        out.append(f"[Q{i}] {lab} | {u}\n{t[:cap]}")
        total += len(t)
    txt = "\n\n".join(out)
    return txt, f"{kind}, {len(blocks)} Quelle(n), {total} Zeichen, gekürzt auf {len(txt)}"


def sources_of(source):
    """Quellenliste aus den [Qn]-Köpfen des Quelltexts."""
    return [{"label": m.group(1).strip(), "url": m.group(2).strip()}
            for m in re.finditer(r"^\[Q\d+\] (.*?) \| (\S+)$", source, re.M)]


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


def validate(d):
    """Pflichtfelder und Typen prüfen (ersetzt den JSON-Schema-Modus, der zwei Durchgänge kostet)."""
    if not isinstance(d, dict):
        return "kein Objekt"
    for k in SCHEMA["required"]:
        if k not in d:
            return f"Feld fehlt: {k}"
    for k in ("h1", "seo_title", "meta_description", "lead", "summary"):
        if not isinstance(d[k], str) or not d[k].strip():
            return f"Feld leer: {k}"
    for k in ("aka", "overview", "todos", "open_points", "facts", "audience", "changes", "timeline", "faq"):
        if isinstance(d[k], str):
            d[k] = [p.strip() for p in re.split(r"\n\s*\n", d[k]) if p.strip()]
        if isinstance(d[k], dict):
            d[k] = [d[k]]
        if not isinstance(d[k], list):
            return f"keine Liste: {k}"
    if not d["audience"] or not d["changes"] or not d["faq"]:
        return "audience, changes oder faq leer"
    for a in d["audience"]:
        if a.get("status") not in ("betroffen", "teilweise", "nicht betroffen") or not a.get("name"):
            return "audience ungültig"
        a.setdefault("note", ""); a.setdefault("detail", "")
    for x in d["timeline"]:
        if x.get("kind") not in ("schritt", "kern", "frist"):
            x["kind"] = "schritt"
    for f in d["facts"]:
        if not isinstance(f, dict) or "label" not in f or "value" not in f:
            return "facts ungültig"
    for c in d["changes"]:
        c.setdefault("ref", "")
    ol = d.get("outline") or []
    if isinstance(ol, dict):
        ol = [ol]
    clean_ol = []
    for o in ol if isinstance(ol, list) else []:
        if isinstance(o, dict) and o.get("heading"):
            its = o.get("items") or []
            if isinstance(its, str):
                its = [its]
            its = [str(x).strip() for x in its if str(x).strip()]
            if its:
                clean_ol.append({"heading": str(o["heading"]).strip(), "items": its})
    d["outline"] = clean_ol
    if d["impact"] not in ("hoch", "mittel", "gering"):
        d["impact"] = "mittel"
    ia = d["impact_analysis"]
    if not isinstance(ia, dict):
        return "impact_analysis kein Objekt"
    for k in ("controls", "processes", "policies", "departments"):
        if not isinstance(ia.get(k), list):
            return f"impact_analysis.{k} keine Liste"
    for k in ("controls", "processes", "policies"):
        for x in ia[k]:
            if not x.get("name") or not x.get("change"):
                return f"impact_analysis.{k} ungültig"
            if isinstance(x.get("steps"), str):
                x["steps"] = [x["steps"]]
            if not isinstance(x.get("steps"), list) or not x["steps"]:
                return f"impact_analysis.{k}: steps fehlen"
    for x in ia["departments"]:
        if x.get("workload") not in ("hoch", "mittel", "gering") or not x.get("name"):
            return "impact_analysis.departments ungültig"
    return ""


def run_model(page, source, src_note):
    exe = shutil.which("claude") or "/usr/local/bin/claude"
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY")}
    env["MAX_THINKING_TOKENS"] = "0"
    user = ("SEITE (bestehende Detailseite auf regradar.de):\n" + json.dumps({
        "titel": page["title"], "datum": page["date"], "rahmenwerk": page["fw_name"], "kategorien": page["pills"],
        "zusammenfassung": page["summary"], "quelle_url": page["orig"]}, ensure_ascii=False, indent=1)
        + ("\n\nVERWANDTE MELDUNGEN (gleiches Rahmenwerk auf regradar.de):\n" + json.dumps(
            page.get("related") or [], ensure_ascii=False, indent=1) if page.get("related") else "")
        + f"\n\nQUELLE ({src_note}):\n" + (source or "(nicht abrufbar)"))
    cmd = [exe, "-p", "--output-format", "json", "--model", MODEL, "--system-prompt", SYSTEM,
           "--tools", "", "--strict-mcp-config",
           "--setting-sources", "local", "--no-session-persistence", "--disable-slash-commands"]
    usage = {"input": 0, "cache_write": 0, "cache_read": 0, "output": 0}
    data, err = None, ""
    for _attempt in range(2):
        rc, so, se = sh(cmd, inp=user.encode(), timeout=600, env=env)
        if rc != 0:
            raise RuntimeError(f"claude -p Exit {rc}: {se.decode()[-400:]} {so.decode()[-400:]}")
        res = json.loads(so)
        u = res.get("usage", {})
        usage["input"] += u.get("input_tokens", 0)
        usage["cache_write"] += u.get("cache_creation_input_tokens", 0)
        usage["cache_read"] += u.get("cache_read_input_tokens", 0)
        usage["output"] += u.get("output_tokens", 0)
        txt = res.get("result", "")
        txt = txt[txt.find("{"): txt.rfind("}") + 1]
        try:
            data = json.loads(txt)
            err = validate(data)
        except ValueError as e:
            data, err = None, f"kein gültiges JSON: {e}"
        if data is not None and not err:
            break
    if data is None or err:
        raise RuntimeError(f"Antwort unbrauchbar: {err}")
    usage["total"] = sum(usage.values())
    usage["turns"] = res.get("num_turns")
    usage["iterations"] = len(u.get("iterations") or [])
    return data, usage


def check(data, page, source):
    """Regelbasierte QS: Daten, die nicht in Seite oder Quelle stehen, fliegen raus."""
    allowed = dates_in(source + " " + " ".join(page["summary"]) + " " + page["title"])
    y, m, d = page["date"].split("-")
    allowed.add((int(d), int(m), int(y)))
    rel = {r["slug"]: r for r in page.get("related") or []}
    for r in rel.values():
        dd, mm_, yy = r["date"].split(".")
        allowed.add((int(dd), int(mm_), int(yy)))
    for t in data["timeline"]:
        if t.get("slug") not in rel:
            t.pop("slug", None)
    data["sources"] = sources_of(source)
    n_src = len(data["sources"])

    def cites(x):
        """Verweise vor das Satzzeichen ziehen ('Satz. [1, 2]' -> 'Satz[1, 2].'), nur vorhandene Nummern."""
        if isinstance(x, str):
            x = re.sub(r"\s*(\[\d+(?:\s*,\s*\d+)*\])([.!?])", r"\1\2", x)
            x = re.sub(r"([.!?])\s+(\[\d+(?:\s*,\s*\d+)*\])", lambda m: m.group(2) + m.group(1), x)
            return re.sub(r"\[(\d+(?:\s*,\s*\d+)*)\]", lambda m: m.group(0) if all(1 <= int(n) <= n_src for n in re.split(r"\s*,\s*", m.group(1))) else "", x)
        if isinstance(x, list):
            return [cites(i) for i in x]
        if isinstance(x, dict):
            return {k: (v if k in ("sources", "meta", "timeline") else cites(v)) for k, v in x.items()}
        return x
    for k in list(data):
        if k not in ("sources", "timeline"):
            data[k] = cites(data[k])
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
