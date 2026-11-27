#!/usr/bin/env python3
"""Listentexte (llm_summary) für EUR-Lex-Dokumente ohne Volltext neu schreiben, über Claude-Abo (claude -p)."""
import concurrent.futures as cf, json, os, shutil, sqlite3, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from regradar import fulltext as ft
from regradar.summarize import SYSTEM_PROMPT
from regradar.db import utcnow
DB = os.path.join(HERE, "data", "regradar.db")
SKIP = {6070}

def work(row):
    did, url, title = row
    r, _ = ft.get(ft.eurlex_text_url(url))
    text = ft._html_text(r.text())[:12000] if r and r.status == 200 else ""
    if not ft._plausible(text):
        return did, None, "kein Volltext"
    ctx = f"Titel: {title}\nBehörde: eur-lex.europa.eu\n\nVolltext-Auszug:\n{text}"
    env = {k: v for k, v in os.environ.items() if not k.startswith("ANTHROPIC_")}
    env["MAX_THINKING_TOKENS"] = "0"
    user = json.dumps([{"id": did, "text": ctx}], ensure_ascii=False)
    cmd = [shutil.which("claude") or "claude", "-p", "--model", "sonnet", "--system-prompt", SYSTEM_PROMPT,
           "--tools", "", "--strict-mcp-config", "--setting-sources", "local", "--no-session-persistence", "--disable-slash-commands"]
    p = subprocess.run(cmd, input=user.encode(), capture_output=True, timeout=600, env=env)
    out = p.stdout.decode()
    out = out[out.find("{"): out.rfind("}") + 1]
    v = json.loads(out)
    v = v.get(str(did), v) if isinstance(v, dict) else v
    return did, (v, text), ""

if __name__ == "__main__":
    c = sqlite3.connect(DB)
    rows = [r for r in c.execute("select f.document_id,f.url,d.title from doc_fulltext f join documents d using(document_id) where f.url like '%eur-lex%' and f.text=''") if r[0] not in SKIP]
    with cf.ThreadPoolExecutor(3) as ex:
        for did, res, err in ex.map(work, rows):
            if not res:
                print("SKIP", did, err); continue
            v, text = res
            ti = v.get("ti") if isinstance(v.get("ti"), dict) else None
            c.execute("update llm_summary set de=?,en=?,created_at=? where document_id=?", (v["de"].strip(), v["en"].strip(), utcnow(), did))
            if ti and ti.get("de") and ti.get("en"):
                c.execute("update llm_summary set ti_de=?,ti_en=? where document_id=?", (ti["de"], ti["en"], did))
            c.execute("update doc_fulltext set text=?,fetched_at=? where document_id=?", (text, utcnow(), did))
            c.commit(); print("ok", did, v["de"][:90].replace("\n", " "))
