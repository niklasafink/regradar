#!/usr/bin/env python3
"""Neu erzeugen der Detailseiten für die N neuesten Meldungen (mit Primärquelle, ausführlich).

Aufruf: python3 scraper/richpages_redo.py [N] [--slug S ...]
Schreibt web/lib/rich.json, committet nicht.
"""
import concurrent.futures as cf, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import richpages as rp  # noqa: E402
REPO = os.path.dirname(HERE)
RICH = os.path.join(REPO, "web", "lib", "rich.json")

def newest(n):
    live = json.load(open(os.path.join(REPO, "web", "lib", "live.json"), encoding="utf-8"))["updates"]
    rows = []
    for fw, us in live.items():
        for u in us:
            d, m, y = u["d"].split(".")
            rows.append((f"{y}-{m}-{d}", f"{fw}-{y}-{m}-{d}-{u['sl']}"))
    rows.sort(key=lambda r: r[0], reverse=True)
    return [s for _, s in rows[:n]]

def one(slug):
    wd = os.path.join(HERE, "data", "rich_work", slug[:60]); os.makedirs(wd, exist_ok=True)
    page = rp.extract_page(slug)
    source, note = rp.fetch_source(page["orig"], wd)
    data, usage = rp.run_model(page, source, note)
    dropped = rp.check(data, page, source)
    words = len(json.dumps(data, ensure_ascii=False).split())
    return slug, {**data, "meta": {"generated": "2026-11-26", "model": rp.MODEL, "source": note,
                                   "dropped": len(dropped), "tokens": usage["total"]}}, words

if __name__ == "__main__":
    args = sys.argv[1:]
    slugs = [a for a in args if not a.isdigit() and a != "--slug"] or newest(int(next((a for a in args if a.isdigit()), 20)))
    rich = json.load(open(RICH))
    with cf.ThreadPoolExecutor(3) as ex:
        futs = {ex.submit(one, s): s for s in slugs}
        for f in cf.as_completed(futs):
            try:
                slug, rec, words = f.result()
            except Exception as e:  # noqa: BLE001
                print("FEHLER", futs[f], e, flush=True); continue
            rich[slug] = rec
            json.dump(dict(sorted(rich.items())), open(RICH, "w"), ensure_ascii=False, indent=1)
            print(f"ok {slug[:60]} {rec['meta']['tokens']} Tokens {words} Wörter {rec['meta']['source']}", flush=True)
