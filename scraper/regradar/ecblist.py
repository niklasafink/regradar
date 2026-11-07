"""EZB-Liste der beaufsichtigten Institute → web/lib/relevance/ecb-entities.json.

Die EZB veröffentlicht monatlich eine Excel-Liste aller SSM-Institute:
bedeutende (SI, mit Gruppenzuordnung und Grund) und weniger bedeutende
(LSI, mit Kennzeichen „HI“ für High-Impact-LSI). Für den Einschlägigkeits-
Abgleich übernehmen wir LEI, Name, Typ (CI, FH, MFH, BR), Land, SI/HI und die
Gruppe. Nur Standardbibliothek (zipfile + ElementTree).

Aufruf: python3 -m regradar ecb-list   (im Stundenlauf höchstens wöchentlich)
"""
import io
import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from typing import Dict, List

LIST_PAGE = "https://www.bankingsupervision.europa.eu/banking/list/html/index.en.html"
BASE = "https://www.bankingsupervision.europa.eu"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                   "web", "lib", "relevance", "ecb-entities.json")
MAX_AGE_S = 7 * 24 * 3600
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
UA = {"User-Agent": "Mozilla/5.0 (compatible; regradar.de)"}

COUNTRIES = {
    "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR", "Cyprus": "CY",
    "Estonia": "EE", "Finland": "FI", "France": "FR", "Germany": "DE", "Greece": "GR",
    "Ireland": "IE", "Italy": "IT", "Latvia": "LV", "Lithuania": "LT", "Luxembourg": "LU",
    "Malta": "MT", "Netherlands": "NL", "Portugal": "PT", "Slovakia": "SK", "Slovenia": "SI",
    "Spain": "ES",
}


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _col(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def _sheets(data: bytes) -> Dict[str, List[List[str]]]:
    z = zipfile.ZipFile(io.BytesIO(data))
    shared: List[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    out: Dict[str, List[List[str]]] = {}
    rid_attr = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    for sh in wb.find("m:sheets", NS):
        path = "xl/" + target[sh.get(rid_attr)].lstrip("/").removeprefix("xl/")
        rows: List[List[str]] = []
        for row in ET.fromstring(z.read(path)).iter("{%s}row" % NS["m"]):
            cells: Dict[int, str] = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None:
                    is_ = c.find("m:is", NS)
                    val = "".join(t.text or "" for t in is_.iter("{%s}t" % NS["m"])) if is_ is not None else ""
                else:
                    val = shared[int(v.text)] if c.get("t") == "s" else (v.text or "")
                cells[_col(c.get("r"))] = val.strip()
            width = max(cells) + 1 if cells else 0
            rows.append([cells.get(i, "") for i in range(width)])
        out[sh.get("name")] = rows
    return out


def _cell(r: List[str], i: int) -> str:
    return r[i] if i < len(r) else ""


def parse(data: bytes) -> List[dict]:
    sheets = _sheets(data)
    ents: List[dict] = []
    group = ""
    for r in sheets.get("SIs", []):
        lei, typ, name = _cell(r, 2), _cell(r, 7), _cell(r, 11)
        if not re.fullmatch(r"[A-Z0-9]{20}", lei or ""):
            continue
        if _cell(r, 1):  # Gruppenkopf trägt die laufende Nummer
            group = name
        ents.append({"lei": lei, "name": name, "type": typ, "si": True, "hi": False,
                     "country": COUNTRIES.get(_cell(r, 17), _cell(r, 17)), "group": group})
    country = ""
    for r in sheets.get("LSIs", []):
        lei, typ, name = _cell(r, 1), _cell(r, 5), _cell(r, 9)
        if not lei and name in COUNTRIES:
            country = COUNTRIES[name]
            continue
        if not re.fullmatch(r"[A-Z0-9]{20}", lei or ""):
            continue
        ents.append({"lei": lei, "name": name, "type": typ, "si": False,
                     "hi": "(HI)" in " ".join(r), "country": country})
    return ents


def export(force: bool = False) -> int:
    """Lädt die aktuelle Liste, wenn die Exportdatei älter als 7 Tage ist."""
    if not force and os.path.exists(OUT) and time.time() - os.path.getmtime(OUT) < MAX_AGE_S:
        return -1
    page = _get(LIST_PAGE).decode("utf-8", "replace")
    m = re.search(r'href="([^"]*listofsupervisedentities\d+\.en\.xlsx)"', page)
    if not m:
        raise RuntimeError("EZB-Liste: Link zur xlsx nicht gefunden")
    url = m.group(1) if m.group(1).startswith("http") else BASE + m.group(1)
    ents = parse(_get(url))
    if len(ents) < 1000:
        raise RuntimeError("EZB-Liste: nur {} Einträge, Format geändert?".format(len(ents)))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"source": url, "fetched_at": time.strftime("%Y-%m-%d"), "entities": ents},
                  f, ensure_ascii=False, separators=(",", ":"))
    return len(ents)


if __name__ == "__main__":
    print(export(force=True))
