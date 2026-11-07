"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  activeName, activeStale, hasProfile, readDraft, recheckProfile, useMe,
} from "@/lib/relevanceClient";

/** Prüfziel der aktuellen Seite: Update-Detail oder Rahmenwerk. */
function targetOf(pathname: string): string | null {
  const u = pathname.match(/^\/u\/([^/]+)$/);
  if (u) return `u:${decodeURIComponent(u[1])}`;
  const f = pathname.match(/^\/r\/[^/]+\/f\/([^/]+)$/);
  if (f) return `f:${decodeURIComponent(f[1])}`;
  return null;
}

/** Kurze Zeile unter der Navigation: Ist diese Seite für mein Institut
    einschlägig? Ohne Profil führt sie in den Profil-Ablauf, mit Vorprofil
    oder Browser-Entwurf bittet sie um Registrierung. */
export function RelevanceBar() {
  const pathname = usePathname() ?? "/";
  const me = useMe();
  const key = targetOf(pathname);
  const withProfile = hasProfile(me);
  const [busy, setBusy] = useState(false);

  if (!me || pathname.startsWith("/profil") || pathname.startsWith("/admin")) return null;
  const name = activeName(me);
  const next = encodeURIComponent(pathname);
  const stale = activeStale(me);

  const register = !me.loggedIn && withProfile ? (
    <Link href="/profil?speichern=1" className="shrink-0 font-medium text-slate-900 underline-offset-2 hover:underline">
      {readDraft() ? "Registrieren, damit das Profil gespeichert wird →" : "Registrieren, um das Profil zu speichern →"}
    </Link>
  ) : null;

  // Detailseiten zeigen den Status oben rechts am Titel (RelevanceStatus);
  // die Zeile bleibt dort nur für Registrierung oder „Neu prüfen“.
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
  } else if (stale) {
    content = (
      <>
        <span className="text-slate-600">
          Profil <span className="font-medium text-slate-900">{stale.name}</span> geändert. Bisherige Einschätzungen bleiben, bis Sie neu prüfen.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await recheckProfile(stale.id); } finally { setBusy(false); } }}
          className="shrink-0 rounded-full bg-slate-900 px-3 py-0.5 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Neu prüfen
        </button>
      </>
    );
  } else if (key) {
    if (!register) return null;
    content = null;
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
