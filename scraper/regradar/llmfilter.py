"""LLM-Relevanzfilter für den Web-Export.

Stuft Meldungen per günstigem LLM (über OpenRouter) als regulatorisch
relevant oder irrelevant ein. Ergebnisse werden pro Dokument in der
SQLite-DB gecacht, sodass jedes Dokument nur einmal klassifiziert wird.

Ohne gesetzten OPENROUTER_API_KEY ist der Filter inaktiv (alle Kandidaten
gelten als relevant); der Regex-NOISE-Vorfilter in webexport.py greift
unabhängig davon immer.
"""
import json
import os
import sqlite3
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-2.5-flash-lite"
BATCH_SIZE = 25
TIMEOUT = 90

# Format-Version des Prompts. Bei inhaltlichen Änderungen hochzählen – der
# nächste Export bewertet dann alle Kandidaten neu (alte Cache-Einträge unter
# der Vorversion werden ignoriert).
FORMAT = 5

SYSTEM_PROMPT = (
    "Du filterst einen Regulatory-News-Feed für Compliance-Abteilungen von "
    "Finanzunternehmen (Banken, Asset Manager, Wertpapier- und Zahlungsinstitute, "
    "Versicherer).\n\n"
    "RELEVANT sind nur Meldungen mit regulatorischem Gehalt: neue oder geänderte "
    "Gesetze und Verordnungen, Gesetzentwürfe, Konsultationen, Leitlinien, "
    "technische Standards (RTS/ITS), Rundschreiben, Merkblätter, Q&As, "
    "Meldewesen-Taxonomien, Gerichtsurteile mit echter Auslegungswirkung für "
    "Institute (z. B. EuGH konkretisiert eine Richtlinien-/Verordnungsnorm), "
    "Fristen sowie aufsichtliche Maßnahmen und Mitteilungen mit Pflichtenbezug.\n\n"
    "NICHT RELEVANT sind: Warnungen vor Betrug/Phishing/unerlaubten Anbietern, "
    "Veranstaltungen, Reden, Panels, Interviews, Personalien, Newsletter, "
    "Stellenausschreibungen, reine Statistiken oder Dashboards ohne "
    "Pflichtenbezug und sonstige PR-Meldungen. Ebenfalls NICHT RELEVANT: reine "
    "Verfahrens- oder Kostenentscheidungen von EU-/nationalen Gerichten ohne "
    "neue materielle Auslegung (z. B. Schlussanträge des Generalanwalts oder "
    "Zurückweisung eines Rechtsmittels in einem Gebühren-/Beitragsstreit) sowie "
    "unverbindliche Nischenberichte internationaler Standardsetzer (IOSCO, "
    "CPMI, BIS, FSB u. ä. – Diskussionspapiere, Marktstudien, Final Reports "
    "ohne verbindliche Umsetzungspflicht), außer sie konkretisieren explizit "
    "ein bereits verfolgtes bindendes EU-/DE-Rahmenwerk. Ebenfalls NICHT "
    "RELEVANT: Aufsichtsmaßnahmen oder Verwaltungsmitteilungen, die sich "
    "ausschließlich auf ein einzelnes, namentlich genanntes Institut oder "
    "einen einzelnen Marktteilnehmer beziehen (z. B. eine Anordnung gegen "
    "ein bestimmtes Kreditinstitut, eine Schwellenwert- oder "
    "Registrierungsmitteilung zu einem einzelnen Benchmark-Administrator), "
    "ohne dass sich das Rahmenwerk selbst ändert – das ist ein Einzelfall-"
    "/Praxis-Signal, kein Update für alle Institute. Ebenfalls NICHT "
    "RELEVANT: Gerichtsentscheidungen, die lediglich eine bestehende "
    "Einstufung oder Entscheidung für ein einzelnes Unternehmen bestätigen "
    "oder eine Klage dagegen abweisen, ohne eine verallgemeinerbare neue "
    "Auslegung für die Breite der Institute zu schaffen (z. B. Bestätigung, "
    "dass ein bestimmter Dienst kein Torwächter-/Gatekeeper-Dienst ist).\n\n"
    "AUSNAHME Bank für Internationalen Zahlungsausgleich: Meldungen mit dem "
    "Präfix [BIS] stammen vom Basler Ausschuss (BCBS), von CPMI oder FSI und "
    "werden bewusst verfolgt (eigenes Rahmenwerk; Basel-Standards sind die "
    "Vorstufe der EU-Bankenregulierung). RELEVANT sind dort: Standards und "
    "Änderungen des Basel-Rahmenwerks, Leitlinien und Grundsätze des "
    "Basler Ausschusses (z. B. BCBS 239, operationelle Resilienz, "
    "Drittparteienrisiken, Kreditrisiko, Klimarisiken, Kryptowerte, "
    "Geldwäsche-Aufsicht), Konsultationen dazu, technische Änderungen und "
    "FAQs, Umsetzungsberichte zu Basel III oder BCBS 239 sowie Mitteilungen "
    "über Sitzungsergebnisse, Umsetzungsfristen und Überprüfungen von "
    "Standards. NICHT RELEVANT bleiben auch mit Präfix [BIS]: Forschungs- und "
    "Arbeitspapiere, Statistiken und Monitoring-Berichte, Marktstudien, "
    "Konferenz- und Veranstaltungsankündigungen, Berichte, die sich nur an "
    "Zentralbanken oder Finanzmarktinfrastrukturen richten (Zahlungsverkehr, "
    "Wertpapierabwicklung, Zentralbankgovernance), sowie FSI-Studien ohne "
    "Standard- oder Leitliniencharakter.\n\n"
    "Ebenfalls NICHT RELEVANT: Mitteilungen über den Ein- oder Austritt "
    "einzelner Panelbanken oder Beitragszahler eines Referenzwerts (z. B. "
    "'Upcoming changes to the Euribor panel' – eine namentlich genannte Bank "
    "verlässt das Panel), auch wenn die Aufsicht die Auswirkung bewertet: "
    "Solange sich die Methodik oder der Rechtsrahmen des Referenzwerts nicht "
    "ändert, folgt daraus für andere Institute keine Pflicht.\n\n"
    "Ebenfalls NICHT RELEVANT: rechtspolitisches Material ohne Pflichten"
    "wirkung – aufsichtliche Empfehlungen und Stellungnahmen AN den "
    "Gesetzgeber (Ratschläge zur Überprüfung/Reform eines Rechtsakts, "
    "'priorities for the review of …', Antworten auf ein Call for Advice, "
    "Stellungnahmen zu fremden Entwürfen) sowie allgemeine Risiko- und "
    "Marktausblicke der Aufsicht (Risk Reports, Risk Dashboards, Financial "
    "Stability Reviews, Trends-and-Risks-Berichte). Sie beschreiben "
    "Einschätzungen, keine Anforderungen; relevant wird daraus erst der "
    "spätere Rechtsakt oder die Konsultation.\n\n"
    "Ebenfalls NICHT RELEVANT: Gesetze und Gesetzentwürfe, die nur "
    "Organisation, Aufgaben oder Befugnisse von Behörden regeln (Zoll, FIU, "
    "Finanzaufsicht, Strafverfolgung, Behördenzusammenarbeit) und keine "
    "Pflichten der Institute ändern – z. B. die Neustrukturierung der "
    "Zollverwaltung mit erweiterten Ermittlungsbefugnissen. Sie werden "
    "relevant, sobald sie Pflichten der Verpflichteten ändern (z. B. "
    "Melde- oder Sorgfaltspflichten nach dem GwG).\n\n"
    "Du erhältst eine JSON-Liste von Objekten mit id und text. Antworte "
    "ausschließlich mit einem JSON-Objekt, das jede id auf true (relevant) "
    "oder false (nicht relevant) abbildet. Keine Erklärungen."
)


def api_key() -> Optional[str]:
    return os.environ.get("OPENROUTER_API_KEY") or None


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS llm_relevance (
               document_id INTEGER PRIMARY KEY REFERENCES documents(document_id),
               relevant    INTEGER NOT NULL,
               model       TEXT NOT NULL,
               checked_at  TEXT NOT NULL,
               fmt         INTEGER NOT NULL DEFAULT 1
           )""")
    cols = [r[1] for r in conn.execute("PRAGMA table_info(llm_relevance)")]
    if "fmt" not in cols:
        conn.execute(
            "ALTER TABLE llm_relevance ADD COLUMN fmt INTEGER NOT NULL DEFAULT 1")
    conn.commit()


def _post_json(model: str, key: str, system: str, user: str):
    """Chat-Anfrage mit JSON-Antwort; gibt das geparste JSON zurück."""
    payload = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer {}".format(key),
            "Content-Type": "application/json",
        })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    # Manche Modelle verpacken JSON in Markdown-Zäune.
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    return json.loads(content)


def _chat(model: str, key: str, items: List[Tuple[int, str]]) -> Dict[int, bool]:
    parsed = _post_json(model, key, SYSTEM_PROMPT, json.dumps(
        [{"id": i, "text": t} for i, t in items], ensure_ascii=False))
    # Manche Modelle liefern statt {"id": bool} eine Liste von
    # {"id": ..., "relevant": ...}-Objekten.
    if isinstance(parsed, list):
        merged = {}
        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            if "id" in entry:
                merged[str(entry["id"])] = entry.get("relevant")
            else:
                merged.update({str(k): v for k, v in entry.items()})
        parsed = merged
    out: Dict[int, bool] = {}
    for i, _ in items:
        v = parsed.get(str(i), parsed.get(i))
        if isinstance(v, bool):
            out[i] = v
    return out


def classify(conn: sqlite3.Connection, items: List[Tuple[int, str]]) -> Dict[int, bool]:
    """items: Liste (document_id, "Titel – Zusammenfassung").

    Rückgabe: document_id -> relevant. Ohne API-Key oder bei API-Fehlern
    gelten unklassifizierte Dokumente als relevant (fail-open), werden dann
    aber nicht gecacht und beim nächsten Lauf erneut versucht.
    """
    _ensure_table(conn)
    result: Dict[int, bool] = {}
    cached = conn.execute(
        "SELECT document_id, relevant FROM llm_relevance "
        "WHERE fmt=? AND document_id IN ({})".format(
            ",".join("?" * len(items)) or "NULL"),
        [FORMAT] + [i for i, _ in items]).fetchall() if items else []
    for row in cached:
        result[row[0]] = bool(row[1])

    todo = [(i, t) for i, t in items if i not in result]
    key = api_key()
    if not key:
        for i, _ in todo:
            result[i] = True
        return result

    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
    from .db import utcnow
    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start:start + BATCH_SIZE]
        try:
            verdicts = _chat(model, key, batch)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                OSError, TypeError, AttributeError, IndexError) as e:
            print("LLM-Filter: Batch übersprungen ({}: {})".format(type(e).__name__, e))
            verdicts = {}
        for i, _ in batch:
            if i in verdicts:
                result[i] = verdicts[i]
                conn.execute(
                    "INSERT OR REPLACE INTO llm_relevance VALUES (?,?,?,?,?)",
                    (i, int(verdicts[i]), model, utcnow(), FORMAT))
            else:
                result[i] = True  # fail-open, nicht cachen
        conn.commit()
    return result
