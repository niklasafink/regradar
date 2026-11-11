"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  invalidate, readDraft, statusPill, useMe, writeDraft,
} from "@/lib/relevanceClient";
import { RelevanceHint } from "@/components/relevance-hint";

type Opt = { id: string; l: string };
const SEATS: Opt[] = [
  { id: "sitz_de", l: "Deutschland" }, { id: "sitz_lu", l: "Luxemburg" }, { id: "sitz_eu", l: "Anderer EU-/EWR-Staat" },
];
type Tri = true | false | null;

interface License { text: string; since: string }
interface Profile {
  id: string;
  name: string;
  gattung: string[];
  address?: string;
  licenses: License[];
  facts: Record<string, boolean>;
  sources: Record<string, string>;
  evidence?: Record<string, string>;
  bilanzsumme?: { mrd: number; jahr?: string; quelle?: string };
  ecb?: { type: string; si: boolean; hi: boolean; group?: string };
  group?: { parent?: string; ultimate?: string; ultimateCountry?: string };
  origin: string;
}
interface Question { id: string; label: string; value: Tri; source: string | null; evidence: string | null }
interface Hit { id: string; name: string; gattung: string; ecb: { si: boolean; hi: boolean; type: string } | null }

type Step = "liste" | "suche" | "manuell" | "laden" | "pruefen" | "speichern" | "gesendet" | "anmelden";

const btn = "inline-flex items-center rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const btn2 = "inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:border-slate-900 disabled:opacity-50";
const card = "rounded-2xl border border-slate-200 bg-white p-5";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
  return json;
}

function supervision(p: { ecb?: Profile["ecb"] | Hit["ecb"] }): string | null {
  const e = p.ecb;
  if (!e) return null;
  const parts = [e.si ? "Direkte EZB-Aufsicht (SI)" : e.hi ? "High-Impact-LSI" : "LSI"];
  if (e.type === "FH" || e.type === "MFH") parts.push("Finanzholding");
  return parts.join(", ");
}

export function ProfilClient({ art, erl }: { art: Opt[]; erl: Opt[] }) {
  const me = useMe();
  const [step, setStep] = useState<Step>("suche");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualFacts, setManualFacts] = useState<Record<string, boolean>>({});

  const [profile, setProfile] = useState<Profile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Tri>>({});
  const [bs, setBs] = useState<string>("");

  const [email, setEmail] = useState("");
  const [accountProfiles, setAccountProfiles] = useState<Profile[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    const res = await fetch("/api/account/profile", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { profiles: Profile[]; activeId: string | null; primaryId: string | null };
    setAccountProfiles(json.profiles);
    setActiveId(json.activeId);
    setPrimaryId(json.primaryId);
  }, []);

  /* Einstieg: Rückkehr aus dem Magic Link, „Registrieren“-Link aus der Zeile,
     Profilverwaltung für angemeldete Nutzer. */
  useEffect(() => {
    if (!me) return;
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");
    if (login === "ok") {
      writeDraft(null);
      setNotice("Sie sind angemeldet. Ihr Profil ist gespeichert und gilt ab sofort auch für Ihre Newsletter-Mails.");
    } else if (login === "abgelaufen") {
      setError("Der Anmeldelink ist abgelaufen oder wurde schon verwendet. Bitte fordern Sie einen neuen an.");
    }
    if (me.loggedIn) {
      void loadAccount();
      setStep(params.get("neu") ? "suche" : "liste");
      return;
    }
    if (params.get("anmelden")) {
      setStep("anmelden");
      return;
    }
    if (params.get("speichern")) {
      const draft = (readDraft() ?? me.pre?.profile) as Profile | undefined;
      if (draft) {
        setProfile(draft);
        setStep("speichern");
      }
    }
    // Nur beim ersten Laden auswerten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.loggedIn]);

  const search = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/relevance/search?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as { hits: Hit[]; error?: string };
      if (json.error) setError(json.error);
      setHits(json.hits ?? []);
    } finally {
      setBusy(false);
    }
  };

  const takeDraft = (json: { profile: Profile; questions: Question[] }) => {
    setProfile(json.profile);
    setQuestions(json.questions);
    setAnswers(Object.fromEntries(json.questions.map((x) => [x.id, x.value])));
    setBs(json.profile.bilanzsumme?.mrd ? String(json.profile.bilanzsumme.mrd).replace(".", ",") : "");
    setStep("pruefen");
  };

  const choose = async (hit: Hit) => {
    setError(null);
    setStep("laden");
    try {
      takeDraft(await post("/api/relevance/draft", { registryId: hit.id }));
    } catch (e) {
      setError((e as Error).message);
      setStep("suche");
    }
  };

  const createManual = async () => {
    setError(null);
    setStep("laden");
    try {
      takeDraft(await post("/api/relevance/draft", { name: manualName.trim(), facts: manualFacts }));
    } catch (e) {
      setError((e as Error).message);
      setStep("manuell");
    }
  };

  /** Rücksprung nach dem Speichern: nur interne Pfade, sonst „Alle Updates“. */
  const nextPath = () => {
    const n = new URLSearchParams(window.location.search).get("next") ?? "";
    return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/profil") ? n : "/updates";
  };

  /* Antworten übernehmen und direkt speichern (keine Vorschau-Liste).
     Angemeldet: ins Konto, aktiv setzen, zurück zur Ausgangsseite; das
     Profil steht dann oben rechts. Gast: Entwurf im Browser, dann registrieren. */
  const saveDirect = async () => {
    if (!profile) return;
    setError(null);
    setBusy(true);
    try {
      const num = Number(bs.replace(/\./g, "").replace(",", "."));
      const upd = await post<{ profile: Profile; questions: Question[] }>("/api/relevance/answers", {
        profile, answers, bilanzsumme: Number.isFinite(num) && num > 0 ? num : null,
      });
      setProfile(upd.profile);
      if (me?.loggedIn) {
        const editing = (accountProfiles ?? []).some((x) => x.id === upd.profile.id);
        const saved = await post<{ rechecked?: number }>("/api/account/profile", { action: "save", profile: upd.profile });
        invalidate();
        if (editing) {
          await loadAccount();
          const n = saved.rechecked ?? 0;
          setNotice(n > 0
            ? `Profil „${upd.profile.name}“ gespeichert. ${n === 1 ? "Eine Einschätzung hängt" : `${n} Einschätzungen hängen`} an den geänderten Angaben und ${n === 1 ? "wird" : "werden"} neu geprüft, alle anderen bleiben bestehen.`
            : `Profil „${upd.profile.name}“ gespeichert. Die Änderungen berühren keine bisherige Einschätzung.`);
          setStep("liste");
        } else {
          window.location.href = nextPath();
        }
        return;
      }
      writeDraft(upd.profile);
      setStep("speichern");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const requestLink = async (withProfile = true) => {
    setError(null);
    setBusy(true);
    try {
      await post("/api/auth/request", { email, profile: withProfile ? profile : null });
      setStep("gesendet");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">
        {step === "liste" ? "Ihre Institutsprofile" : step === "anmelden" ? "Anmelden" : "Welche Updates sind für Ihr Institut einschlägig?"}
      </h1>
      {step !== "liste" && step !== "anmelden" && (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Legen Sie einmal ein Profil Ihres Instituts an. Danach zeigen wir bei jeder Meldung auf der Website und in
          Ihren Newsletter-Mails, ob sie für Ihr Institut einschlägig ist. Beraterinnen, Berater und Prüfer können
          mehrere Institute anlegen.
        </p>
      )}

      {notice && <p className="mt-5 rounded-2xl border border-slate-900 px-4 py-3 text-sm text-slate-900">{notice}</p>}
      {error && <p className="mt-5 text-sm font-medium text-red-600">{error}</p>}

      {/* Profilverwaltung (angemeldet) */}
      {step === "liste" && (
        <section className="mt-6 space-y-3">
          <p className="text-sm text-slate-600">Angemeldet als {me?.email}. Die Einschlägigkeit auf der Website gilt für das aktive Profil, das Sie oben rechts wechseln. Ihre Newsletter-Mails kennzeichnen nur das primäre Profil.</p>
          {(accountProfiles ?? []).map((p) => (
            <div key={p.id} className={`${card} flex flex-wrap items-center gap-3`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">{p.gattung.join(", ") || "Manuell angelegt"}{supervision(p) ? `, ${supervision(p)}` : ""}</p>
              </div>
              {p.id === primaryId ? (
                <span className={statusPill("teilweise")} title="Gilt für Ihre Newsletter-Mails">Primär (Newsletter)</span>
              ) : (
                <button type="button" className={btn2} title="Dieses Profil kennzeichnet künftig Ihre Newsletter-Mails" onClick={async () => {
                  await post("/api/account/profile", { action: "primary", id: p.id });
                  setPrimaryId(p.id);
                  invalidate();
                }}>Als primär setzen</button>
              )}
              {p.id === activeId ? (
                <span className={statusPill("ja")}>Aktiv</span>
              ) : (
                <button type="button" className={btn2} onClick={async () => {
                  await post("/api/account/profile", { action: "activate", id: p.id });
                  setActiveId(p.id);
                  invalidate();
                }}>Aktiv setzen</button>
              )}
              <button type="button" className={btn2} onClick={() => {
                setProfile(p);
                setQuestions([]);
                setAnswers({});
                setBs(p.bilanzsumme?.mrd ? String(p.bilanzsumme.mrd).replace(".", ",") : "");
                void post<{ profile: Profile; questions: Question[] }>("/api/relevance/answers", { profile: p, answers: {} })
                  .then((r) => { setQuestions(r.questions); setAnswers(Object.fromEntries(r.questions.map((x) => [x.id, x.value]))); });
                setStep("pruefen");
              }}>Bearbeiten</button>
              <a className={btn2} href={`/api/relevance/export?profileId=${encodeURIComponent(p.id)}`} download
                title="Excel-Datei mit allen Rahmenwerken und Updates, ein Blatt je Themengebiet">Export (Excel)</a>
              <button type="button" className="text-sm text-slate-500 hover:text-red-600" onClick={async () => {
                if (!confirm(`Profil „${p.name}“ löschen?`)) return;
                await post("/api/account/profile", { action: "delete", id: p.id });
                invalidate();
                await loadAccount();
              }}>Löschen</button>
            </div>
          ))}
          {accountProfiles?.length === 0 && <p className="text-sm text-slate-500">Noch kein Profil angelegt.</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" className={btn} onClick={() => { setNotice(null); setHits(null); setQ(""); setStep("suche"); }}>
              Weiteres Institut anlegen
            </button>
            <button type="button" className={btn2} onClick={async () => {
              await post("/api/auth/logout", {});
              invalidate();
              window.location.href = "/";
            }}>Abmelden</button>
          </div>
        </section>
      )}

      {/* Schritt 1: Institut suchen */}
      {step === "suche" && (
        <section className="mt-8">
          <label className="text-sm font-medium text-slate-900" htmlFor="inst">Name des Instituts</label>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <input
              id="inst"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="z. B. Hamburger Sparkasse, GRENKE, Deka Investment"
              className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <button type="submit" className={btn} disabled={busy || q.trim().length < 3}>Suchen</button>
          </form>
          {me && !me.loggedIn && (
            <p className="mt-3 text-xs text-slate-500">
              Schon registriert?{" "}
              <button type="button" className="font-medium text-slate-900 underline-offset-2 hover:underline" onClick={() => setStep("anmelden")}>
                Anmelden
              </button>
              , dann landet das Profil direkt in Ihrem Konto.
            </p>
          )}
          {hits && (
            <ul className="mt-4 space-y-2">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => void choose(h)} className={`${card} block w-full text-left hover:border-slate-900`}>
                    <span className="block font-medium text-slate-900">{h.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {h.gattung || "Ohne Angabe"}{supervision(h) ? `, ${supervision(h)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
              {hits.length === 0 && <li className="text-sm text-slate-500">Kein Treffer. Versuchen Sie den vollständigen Firmennamen.</li>}
            </ul>
          )}
          <p className="mt-6 text-sm text-slate-500">
            Institut nicht dabei, etwa ein Versicherer mit Sitz außerhalb Deutschlands?{" "}
            <button type="button" className="font-medium text-slate-900 underline-offset-2 hover:underline" onClick={() => { setManualName(q); setStep("manuell"); }}>
              Profil von Hand anlegen
            </button>
          </p>
        </section>
      )}

      {/* Alternative: manuell */}
      {step === "manuell" && (
        <section className="mt-8 space-y-6">
          <div>
            <label className="text-sm font-medium text-slate-900" htmlFor="mname">Name</label>
            <input id="mname" value={manualName} onChange={(e) => setManualName(e.target.value)}
              className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Sitz</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SEATS.map((o) => (
                <button key={o.id} type="button" aria-pressed={!!manualFacts[o.id]}
                  onClick={() => setManualFacts((f) => { const n = { ...f }; for (const s of SEATS) delete n[s.id]; if (!f[o.id]) n[o.id] = true; return n; })}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${manualFacts[o.id] ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {[["Institutsart", art], ["Erlaubnisse", erl]].map(([label, opts]) => (
            <div key={label as string}>
              <p className="text-sm font-medium text-slate-900">{label as string}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(opts as Opt[]).map((o) => (
                  <button key={o.id} type="button" aria-pressed={!!manualFacts[o.id]}
                    onClick={() => setManualFacts((f) => { const n = { ...f }; if (n[o.id]) delete n[o.id]; else n[o.id] = true; return n; })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${manualFacts[o.id] ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className={btn} disabled={!manualName.trim() || !Object.keys(manualFacts).length} onClick={() => void createManual()}>Weiter</button>
            <button type="button" className={btn2} onClick={() => setStep("suche")}>Zurück zur Suche</button>
          </div>
        </section>
      )}

      {step === "laden" && (
        <p className="mt-10 text-sm text-slate-600">Erlaubnisse, Aufsichtsstatus und Konzernstruktur werden zusammengestellt. Das dauert bis zu einer halben Minute …</p>
      )}

      {/* Schritt 2: prüfen und ergänzen */}
      {step === "pruefen" && profile && (
        <section className="mt-8 space-y-6">
          <div className={card}>
            <p className="font-heading text-lg font-medium tracking-tight text-slate-900">{profile.name}</p>
            {profile.address && <p className="mt-1 text-xs text-slate-500">{profile.address}</p>}
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
              {profile.gattung.length > 0 && (<><dt className="text-slate-500">Institutsart</dt><dd>{profile.gattung.join(", ")}</dd></>)}
              {supervision(profile) && (<><dt className="text-slate-500">Aufsicht</dt><dd>{supervision(profile)}{profile.ecb?.group ? `, Gruppe ${profile.ecb.group}` : ""}</dd></>)}
              {profile.group?.parent && (<><dt className="text-slate-500">Muttergesellschaft</dt><dd>{profile.group.parent}{profile.group.ultimate && profile.group.ultimate !== profile.group.parent ? ` (oberste: ${profile.group.ultimate})` : ""}</dd></>)}
            </dl>
          </div>

          {profile.licenses.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-900">Erlaubnisse ({profile.licenses.length})</p>
              <ul className="mt-2 divide-y divide-slate-50 rounded-2xl border border-slate-200 bg-white text-sm">
                {profile.licenses.map((l) => (
                  <li key={l.text} className="flex gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 text-slate-700">{l.text}</span>
                    {l.since && <span className="num shrink-0 text-xs text-slate-400">seit {l.since}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-900" htmlFor="bs">Bilanzsumme in Mrd. € (Einzelinstitut)</label>
            <p className="mt-1 text-xs text-slate-500">Entscheidet über Erleichterungen und Zusatzpflichten, etwa SNCI (bis 5 Mrd. €) oder bedeutendes Institut nach IVV (ab 15 Mrd. €).</p>
            <input id="bs" inputMode="decimal" value={bs} onChange={(e) => setBs(e.target.value)} placeholder="z. B. 4,2"
              className="mt-2 w-40 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none" />
            {profile.bilanzsumme?.quelle && (
              <p className="mt-1 text-xs text-slate-500">
                Vorschlag{profile.bilanzsumme.jahr ? ` (${profile.bilanzsumme.jahr})` : ""}:{" "}
                <a href={profile.bilanzsumme.quelle} target="_blank" rel="noopener noreferrer" className="underline">Quelle ↗</a>
              </p>
            )}
          </div>

          {questions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-900">Was trifft auf Ihr Institut zu?</p>
              <p className="mt-1 text-xs text-slate-500">Vorausgefüllt, soweit öffentlich belegbar. Bitte prüfen; „Weiß nicht“ ist erlaubt, dann fragen wir bei Bedarf nach.</p>
              <ul className="mt-3 space-y-2">
                {questions.map((x) => (
                  <li key={x.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1 text-sm text-slate-800">{x.label}</span>
                      <span className="flex gap-1">
                        {([[true, "Ja"], [false, "Nein"], [null, "Weiß nicht"]] as [Tri, string][]).map(([v, l]) => (
                          <button key={l} type="button" aria-pressed={answers[x.id] === v}
                            onClick={() => setAnswers((a) => ({ ...a, [x.id]: v }))}
                            className={`rounded-full border px-3 py-0.5 text-xs font-medium ${answers[x.id] === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                            {l}
                          </button>
                        ))}
                      </span>
                    </div>
                    {x.evidence && x.source === "recherche" && (
                      <p className="mt-1 text-xs text-slate-400">Vorschlag: {x.evidence}</p>
                    )}
                    <RelevanceHint merkmal={x.id} className="mt-1.5" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void saveDirect()}>{busy ? "Speichert …" : "Profil speichern"}</button>
            <button type="button" className={btn2} onClick={() => setStep(me?.loggedIn ? "liste" : "suche")}>Zurück</button>
          </div>
        </section>
      )}

      {/* Schritt 4: registrieren (Magic Link) */}
      {step === "speichern" && profile && (
        <section className="mt-8 max-w-xl">
          <p className="text-sm text-slate-600">
            Das Profil <span className="font-medium text-slate-900">{profile.name}</span> ist vorbereitet. Die Einschätzung, welche
            Updates und Rahmenwerke einschlägig sind, sehen Sie nach der Anmeldung; dann zeigen auch Ihre Newsletter-Mails die
            Einschlägigkeit. Ein Passwort gibt es nicht: Sie bekommen einen Anmeldelink per E-Mail. Nutzen Sie am besten dieselbe
            Adresse wie für den Newsletter.
          </p>
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void requestLink(); }}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@institut.de"
              className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none" />
            <button type="submit" className={btn} disabled={busy}>Anmeldelink senden</button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Hinweise zur Verarbeitung Ihrer Daten in der <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link>.
          </p>
        </section>
      )}

      {step === "anmelden" && (
        <section className="mt-6 max-w-xl">
          <p className="text-sm text-slate-600">
            Sie haben schon ein Konto oder abonnieren den Newsletter? Geben Sie Ihre E-Mail-Adresse ein. Sie bekommen einen
            Anmeldelink, ein Passwort gibt es nicht. Danach bleiben Sie in diesem Browser angemeldet und können Institutsprofile
            anlegen und wechseln.
          </p>
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setProfile(null); void requestLink(false); }}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@institut.de" autoComplete="email"
              className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-slate-900 focus:outline-none" />
            <button type="submit" className={btn} disabled={busy}>Anmeldelink senden</button>
          </form>
          <p className="mt-4 text-sm text-slate-600">
            Noch kein Konto?{" "}
            <button type="button" className="font-medium text-slate-900 underline-offset-2 hover:underline" onClick={() => setStep("suche")}>
              Institutsprofil anlegen
            </button>
          </p>
        </section>
      )}

      {step === "gesendet" && (
        <section className="mt-8 max-w-xl">
          <p className="text-sm text-slate-600">
            Wir haben einen Anmeldelink an <span className="font-medium text-slate-900">{email}</span> geschickt. Er ist 30 Minuten
            gültig. {profile ? "Nach dem Klick ist Ihr Profil gespeichert." : "Nach dem Klick sind Sie angemeldet und bleiben es in diesem Browser."}
          </p>
        </section>
      )}
    </div>
  );
}
