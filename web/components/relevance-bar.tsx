"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  activeName, hasProfile, invalidate, readDraft, STATUS_LABEL, statusPill, useMe, useRelevance,
  writeDraft, type Me,
} from "@/lib/relevanceClient";
import { RelevanceHint } from "./relevance-hint";

/** Prüfziel der aktuellen Seite: Update-Detail oder Rahmenwerk. */
function targetOf(pathname: string): string | null {
  const u = pathname.match(/^\/u\/([^/]+)$/);
  if (u) return `u:${decodeURIComponent(u[1])}`;
  const f = pathname.match(/^\/r\/[^/]+\/f\/([^/]+)$/);
  if (f) return `f:${decodeURIComponent(f[1])}`;
  return null;
}

async function answer(me: Me, merkmal: string, value: boolean) {
  const answers = { [merkmal]: value };
  if (me.loggedIn) {
    await fetch("/api/account/answer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }),
    });
    invalidate();
    return;
  }
  const base = readDraft() ?? (me.pre as { profile?: unknown } | null)?.profile;
  if (!base) return;
  const res = await fetch("/api/relevance/answers", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: base, answers }),
  });
  const json = (await res.json()) as { profile?: unknown };
  if (json.profile) writeDraft(json.profile);
}

/** Kurze Zeile unter der Navigation: Ist diese Seite für mein Institut
    einschlägig? Ohne Profil führt sie in den Profil-Ablauf, mit Vorprofil
    oder Browser-Entwurf bittet sie um Registrierung. */
export function RelevanceBar() {
  const pathname = usePathname() ?? "/";
  const me = useMe();
  const key = targetOf(pathname);
  const withProfile = hasProfile(me);
  const res = useRelevance(key ? [key] : [], withProfile && !!key);
  const [busy, setBusy] = useState(false);

  if (!me || pathname.startsWith("/profil") || pathname.startsWith("/admin")) return null;
  const name = activeName(me);
  const r = key ? res[key] : undefined;
  const next = encodeURIComponent(pathname);

  const register = !me.loggedIn && withProfile ? (
    <Link href="/profil?speichern=1" className="shrink-0 font-medium text-slate-900 underline-offset-2 hover:underline">
      {readDraft() ? "Registrieren, damit das Profil gespeichert wird →" : "Registrieren, um das Profil zu speichern →"}
    </Link>
  ) : null;

  let content: React.ReactNode;
  if (!withProfile) {
    content = (
      <>
        <span className="text-slate-600">
          {key
            ? "Ist das für Ihr Institut einschlägig?"
            : "Für welches Institut lesen Sie? Wir zeigen bei jeder Meldung, ob sie einschlägig ist."}
        </span>
        <Link
          href={`/profil?next=${next}`}
          data-fast-goal="relevance_start"
          className="shrink-0 rounded-full bg-slate-900 px-3 py-0.5 font-medium text-white hover:bg-slate-700"
        >
          {key ? "Für mein Institut prüfen →" : "Institutsprofil anlegen →"}
        </Link>
      </>
    );
  } else if (key && !r) {
    content = <span className="text-slate-500">Prüfe die Einschlägigkeit für {name} …</span>;
  } else if (key && r) {
    content = (
      <>
        <span className={statusPill(r.status)}>{STATUS_LABEL[r.status]}</span>
        <span className="min-w-0 text-slate-600">
          <span className="font-medium text-slate-900">für {name}</span>
          {r.status === "unsicher" && r.frage ? (
            <>: {r.frage.frage}</>
          ) : (
            <>: {r.grund}{r.status === "teilweise" && r.teile ? ` Es gelten: ${r.teile}` : ""}</>
          )}
        </span>
        {r.status === "unsicher" && r.frage && (
          <span className="flex shrink-0 gap-1.5">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try { await answer(me, r.frage!.merkmal, v); } finally { setBusy(false); }
                }}
                className="rounded-full border border-slate-900 px-3 py-0.5 font-medium text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-50"
              >
                {v ? "Ja" : "Nein"}
              </button>
            ))}
          </span>
        )}
        {r.status === "unsicher" && r.frage && (
          <RelevanceHint merkmal={r.frage.merkmal} className="basis-full" />
        )}
      </>
    );
  } else {
    content = (
      <span className="text-slate-600">
        Bei jeder Meldung sehen Sie, ob sie für <span className="font-medium text-slate-900">{name}</span> einschlägig ist.
      </span>
    );
  }

  return (
    <div className="border-b border-slate-100 bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 text-center text-xs sm:px-6">
        {content}
        {!me.loggedIn && me.pre?.name && !readDraft() && (
          <span className="text-slate-500">Vorausgefüllt anhand Ihrer E-Mail-Domain.</span>
        )}
        {register}
      </div>
    </div>
  );
}
