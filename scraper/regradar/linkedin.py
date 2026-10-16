"""Tages-Post für LinkedIn: ein Beitrag pro Werktagmorgen zu allen Meldungen
des Vortags (montags: Freitag bis Sonntag).

Schreibt web/lib/linkedin.json. Der Text und die Slides werden in der Web-App
gebaut (web/lib/linkedin.ts, /api/linkedin/…); hier entstehen nur die
LLM-Bausteine, die sich nicht regelbasiert erzeugen lassen:

- ``hook``: die erste Zeile des Posts, sachlich, mit Frist oder Pflicht,
- ``folge``, ``zeilen``, ``frage``: Folge für das Institut, Kurzzeilen zu den
  übrigen Meldungen und eine Fachfrage an die Leser,
- ``cover``: die Überschrift der Titel-Slide zur selben Meldung, kurz,
- ``kern`` je Meldung: ein Satz, was das Institut tun oder prüfen muss.

Regeln stehen in LINKEDIN.md (Abschnitt „Tages-Post“). Ein Eintrag wird nur
neu erzeugt, wenn sich die Meldungsmenge des Tages ändert oder FORMAT
hochgezählt wird. Gepostet wird hier nichts.
"""
import datetime as dt
import json
import os
import re
import urllib.request
from typing import Dict, List, Optional

from .llmfilter import API_URL, api_key
from .summarize import DEFAULT_MODEL
from .webexport import WEB_LIVE_PATH

LINKEDIN_PATH = os.path.join(os.path.dirname(WEB_LIVE_PATH), "linkedin.json")
# Bei inhaltlichen Prompt-Änderungen hochzählen: alle Tages-Posts neu erzeugen.
FORMAT = 5
# So viele Posttage rückwirkend vorhalten (Vorschau und verspätete Posts).
KEEP_DAYS = 14
TIMEOUT = 120

SYSTEM_PROMPT = """Du schreibst für Regulatory Radar (regradar.de) den täglichen
LinkedIn-Beitrag für Compliance-Officer in Banken, Versicherern,
Wertpapierinstituten und Kapitalverwaltungsgesellschaften. Du bekommst die
regulatorischen Meldungen eines Tages als JSON-Liste (id, behoerde, typ, titel,
zusammenfassung, frist, impact = high/medium/low).

Liefere ein JSON-Objekt:
{"hook": "...", "folge": "...", "cover": "...", "top": "<id>",
 "zeilen": ["...", ...], "frage": "...", "kern": {"<id>": "...", ...},
 "doppelt": {"<id>": "<id>", ...}}

top: die id der wichtigsten Meldung (höchster impact, bei Gleichstand die
früheste Frist). hook, folge und cover beziehen sich auf sie. Routinemäßige
Aktualisierungen von Sanktionslisten (einzelne Personen oder Organisationen
ergänzt oder gestrichen) sind nie top, solange es eine andere Meldung gibt.
Übertreibe nie („verschärfen sich erneut“ für einen einzelnen Listeneintrag).

hook: die erste Zeile des Posts, höchstens 100 Zeichen, ein Satz. Mobil sind
nur rund 140 Zeichen vor „…mehr“ sichtbar, der hook muss allein tragen. Er
hat eine Pointe: die überraschende oder folgenreiche Seite der Meldung, gern
als knapper Kontrast aus den Fakten („Erst erstatten, dann prüfen: Der EuGH
verschärft die Regeln für nicht autorisierte Zahlungen.“). Verboten: Fragen,
Ausrufezeichen, Emojis, Superlative, Clickbait („Das müssen Sie wissen“,
„Achtung“), erfundene Fakten, Mittelpunkte „·“.

folge: ein bis zwei Sätze, höchstens 240 Zeichen: was genau gilt und was das
für das Institut praktisch heißt (welcher Prozess, welche Pflicht, bis wann).
Die praktische Folge darf abgeleitet sein, muss aber zwingend aus den Fakten
folgen.

cover: die Überschrift der Titel-Slide, höchstens 55 Zeichen, Form „Behörde:
Kernaussage“, z. B. „EuGH: Zahlungsdienstleister müssen sofort erstatten“.
Behörde als Name (BaFin, EuGH, EU-Amtsblatt, Bundesgesetzblatt), nie als
Domain wie „recht.bund.de“. Kein Datum, keine Fragen, kein Clickbait.

zeilen: höchstens drei kurze Zeilen zu den ÜBRIGEN Meldungen (nicht top), je
höchstens 90 Zeichen, Form „Behörde: Kernaussage“ mit der konkretesten Zahl,
Frist oder Pflicht, z. B. „ESMA: 955 Sanktionen im Jahr 2025, zusammen 81,9
Mio. Euro Bußgeld“. Behandeln zwei Meldungen dasselbe Dokument oder Thema,
fasse sie in einer Zeile zusammen. Wichtigste zuerst. Keine Pfeile oder
Aufzählungszeichen, die setzt die App. Behörde als Name, nie als Domain.

frage: eine konkrete Fachfrage an die Leser zu ihrer Praxis im Institut,
passend zur top-Meldung, höchstens 110 Zeichen, Anrede „Sie“, z. B. „Wie lange
dauert bei Ihnen heute eine Erstattung, wenn der Kunde Betrug meldet?“. Keine
Köder wie „Was meinen Sie?“ oder „Stimmen Sie zu?“.

kern: je Meldung genau EIN deutscher Satz, höchstens 160 Zeichen, der den
Kern auf den Punkt bringt: was sich ändert, für wen, ab wann bzw. bis wann.
Gibt es eine konkrete Pflicht oder Frist, steht sie im Satz. Gibt es keine
(Bericht, Statistik, Konsultation), sag sachlich, was drinsteht oder wer sich
bis wann beteiligen kann. Verboten sind Schablonen wie „Institute sollten …
prüfen, um … zu verstehen“ oder „… im Blick behalten“, Paragrafen, das
Wiederholen des Titels.

doppelt: Meldungen, die dasselbe Dokument oder Paket wie eine andere Meldung
der Liste behandeln (z. B. ein Bericht und die zugehörige Tabelle oder ein
Anhang dazu). Schlüssel ist die weniger aussagekräftige Meldung, die entfällt,
Wert die Meldung, die bleibt und den Inhalt trägt. Eine Meldung, die bleibt,
ist nie selbst Schlüssel; die top-Meldung entfällt nie. Keine Dubletten: {}.

Für alle Felder: Englische Eigenbegriffe (DORA, MiCA, RTS, Q&A) bleiben. Keine
Floskeln wie „nicht nur …, sondern auch“, „Das Ergebnis?“, „Hier kommt … ins
Spiel“. Nur Fakten aus der Eingabe verwenden. Datumsangaben immer vollständig
im Format TT.MM.JJJJ und nur, wenn genau dieses Datum in der Eingabe steht.
Kennungen wie „09/2026“ oder „(04/2026)“ sind Aktenzeichen, keine Fristen."""

# Höchstlängen; längere LLM-Antworten werden verworfen und neu erzeugt.
MAX_LEN = {"hook": 110, "cover": 70, "folge": 280, "frage": 130, "zeile": 110}


def post_window(post_day: dt.date) -> List[dt.date]:
    """Meldungstage, die der Post am ``post_day`` abdeckt: der Vortag,
    montags Freitag bis Sonntag. Am Wochenende wird nicht gepostet."""
    if post_day.weekday() >= 5:
        return []
    back = 3 if post_day.weekday() == 0 else 1
    return [post_day - dt.timedelta(days=n) for n in range(back, 0, -1)]


def next_post_day(day: dt.date) -> dt.date:
    """Erster Posttag, dessen Fenster den Meldungstag ``day`` enthält."""
    p = day + dt.timedelta(days=1)
    while day not in post_window(p):
        p += dt.timedelta(days=1)
    return p


def _items_by_day(live: dict) -> Dict[dt.date, List[dict]]:
    """Meldungen je Veröffentlichungstag, dedupliziert über Rahmenwerke
    hinweg (dieselbe Meldung kann in mehreren Rahmenwerken hängen)."""
    out: Dict[dt.date, Dict[str, dict]] = {}
    for fw, ups in live.get("updates", {}).items():
        for u in ups:
            key = u.get("sl") or u.get("url") or u["ti"]["de"]
            day = dt.datetime.strptime(u["d"], "%d.%m.%Y").date()
            hit = out.setdefault(day, {}).get(key)
            if hit:
                hit["fws"].append(fw)
            else:
                out[day][key] = {"key": key, "fws": [fw], "u": u}
    return {d: list(v.values()) for d, v in out.items()}


def _chat(key: str, model: str, items: List[dict], retry: str = "") -> dict:
    """Ein LLM-Aufruf. ``retry`` meldet den Fehler des vorigen Versuchs zurück."""
    payload = {
        "model": model,
        "temperature": 0.3,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps([{
                "id": it["key"],
                "behoerde": it["u"]["src"],
                "typ": it["u"]["t"]["de"],
                "titel": it["u"]["ti"]["de"],
                "zusammenfassung": it["u"]["s"]["de"],
                "frist": it["u"].get("deadline") or it["u"].get("eff") or "",
                "impact": it["u"].get("imp") or "",
            } for it in items], ensure_ascii=False)},
        ] + ([{"role": "user", "content": "Dein letzter Versuch wurde verworfen: {}. "
               "Halte alle Höchstlängen ein (hook höchstens 100 Zeichen) und liefere das "
               "ganze JSON neu.".format(retry)}] if retry else []),
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer {}".format(key),
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"].strip()
    content = content.removeprefix("```json").removeprefix("```").removesuffix("```")
    parsed = json.loads(content)
    text = {f: str(parsed.get(f) or "").strip() for f in ("hook", "folge", "cover", "frage")}
    zeilen = [str(z).strip().lstrip("→-• ").rstrip(".").strip()
              for z in (parsed.get("zeilen") or []) if str(z).strip()][:3]
    kern = {str(k): str(v).strip() for k, v in (parsed.get("kern") or {}).items()}
    top = str(parsed.get("top") or "")
    if top not in kern:
        top = items[0]["key"]
    keys = {it["key"] for it in items}
    raw = parsed.get("doppelt") or {}
    pairs = {str(k): str(v) for k, v in raw.items()} if isinstance(raw, dict) else {}
    # Nur gültige Paare; was bleibt, darf nie selbst entfallen (sonst fiele das Thema ganz weg).
    pairs = {k: v for k, v in pairs.items() if k in keys and v in keys and k != v and k != top}
    doppelt = sorted(k for k in pairs if k not in set(pairs.values()))
    if not all(text.values()) or any(it["key"] not in kern for it in items):
        raise ValueError("LLM-Antwort unvollständig (hook, folge, cover, frage oder kern fehlt)")
    too_long = [f for f, v in text.items() if len(v) > MAX_LEN[f]]
    too_long += ["zeile"] if any(len(z) > MAX_LEN["zeile"] for z in zeilen) else []
    if too_long:
        raise ValueError("zu lang: {}".format(", ".join(
            "{} ({} Zeichen)".format(f, len(text[f])) if f in text else f for f in too_long)))
    # Domains wie „eur-lex.europa.eu:“ statt eines Behördennamens
    if any(re.match(r"^[\w-]+(\.[\w-]+)+\s*:", t) for t in [text["cover"], *zeilen]):
        raise ValueError("Behörde als Domain statt als Name (z. B. EU-Amtsblatt statt eur-lex.europa.eu)")
    if "?" in text["hook"]:
        raise ValueError("hook ist eine Frage")
    for t in [*text.values(), *zeilen, *kern.values()]:
        bad = _bad_dates(t, items)
        if bad:
            raise ValueError("Datum ohne Beleg in der Eingabe: {}".format(", ".join(bad)))
    return {**text, "zeilen": zeilen, "top": top, "kern": kern, "doppelt": doppelt}


MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]


def _bad_dates(text: str, items: List[dict]) -> List[str]:
    """Datumsangaben im LLM-Text, die so nicht in den Meldungen stehen,
    sowie unvollständige Angaben wie „09.2026“ (meist ein Aktenzeichen)."""
    source = " ".join(
        " ".join([it["u"]["s"]["de"], it["u"]["ti"]["de"], it["u"]["d"],
                  it["u"].get("deadline") or "", it["u"].get("eff") or ""])
        for it in items)
    bad = re.findall(r"(?<![\d.])\d{1,2}\.\d{4}\b", text)
    for m in re.finditer(r"\b(\d{2})\.(\d{2})\.(\d{4})\b", text):
        day, month, year = (int(x) for x in m.groups())
        spelled = r"\b0?{}\.\s*{}\s+{}".format(day, MONTHS[month - 1], year) if 1 <= month <= 12 else "$^"
        if m.group(0) not in source and not re.search(spelled, source):
            bad.append(m.group(0))
    return bad


def build(today: Optional[dt.date] = None, force: bool = False,
          only: Optional[dt.date] = None) -> dict:
    """Erzeugt bzw. aktualisiert die Tages-Posts der letzten KEEP_DAYS
    Posttage (inkl. heute und morgen, damit die Vorschau früh steht)."""
    today = today or dt.date.today()
    with open(WEB_LIVE_PATH, encoding="utf-8") as f:
        by_day = _items_by_day(json.load(f))
    try:
        with open(LINKEDIN_PATH, encoding="utf-8") as f:
            old = json.load(f).get("posts", {})
    except (OSError, ValueError):
        old = {}
    key = api_key()
    model = os.environ.get("OPENROUTER_SUMMARY_MODEL", DEFAULT_MODEL)
    posts, stats = {}, {"neu": 0, "unverändert": 0, "leer": 0, "fehler": 0}
    days = [only] if only else [today + dt.timedelta(days=n)
                                for n in range(-KEEP_DAYS, 2)]
    for p in days:
        window = post_window(p)
        items = [it for d in window for it in by_day.get(d, [])]
        if not items:
            stats["leer"] += 1
            continue
        keys = sorted(it["key"] for it in items)
        prev = old.get(p.isoformat())
        if prev and not force and prev.get("keys") == keys and prev.get("fmt") == FORMAT:
            posts[p.isoformat()] = prev
            stats["unverändert"] += 1
            continue
        if not key:
            print("LinkedIn: kein OPENROUTER_API_KEY, {} übersprungen".format(p))
            stats["fehler"] += 1
            continue
        try:
            retry = ""
            for attempt in range(3):  # Längen- und Datumsprüfung: bis zu drei Versuche
                try:
                    got = _chat(key, model, items, retry)
                    break
                except ValueError as e:
                    if attempt == 2:
                        raise
                    retry = str(e)
        except Exception as e:  # einzelner Tag darf den Lauf nicht abbrechen
            print("LinkedIn: {} fehlgeschlagen: {}".format(p, e))
            if prev:
                posts[p.isoformat()] = prev
            stats["fehler"] += 1
            continue
        posts[p.isoformat()] = {
            "window": [d.isoformat() for d in window],
            "keys": keys,
            "hook": got["hook"],
            "folge": got["folge"],
            "cover": got["cover"],
            "zeilen": got["zeilen"],
            "frage": got["frage"],
            "top": got["top"],
            "kern": got["kern"],
            "doppelt": got["doppelt"],
            "fmt": FORMAT,
            "model": model,
        }
        stats["neu"] += 1
    if only:  # Einzeltag: übrige Einträge unangetastet lassen
        merged = dict(old)
        merged.update(posts)
        posts = merged
    with open(LINKEDIN_PATH, "w", encoding="utf-8") as f:
        json.dump({"posts": dict(sorted(posts.items()))}, f,
                  ensure_ascii=False, indent=1)
        f.write("\n")
    stats["path"] = LINKEDIN_PATH
    return stats
