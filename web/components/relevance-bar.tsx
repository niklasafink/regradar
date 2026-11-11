"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  activeName, hasDraftOnly, hasProfile, useMe,
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
    oder Browser-Entwurf bittet sie um die Anmeldung (ohne Anmeldung gibt es
    keine Einschätzung). */
export function RelevanceBar() {
  const pathname = usePathname() ?? "/";
  const me = useMe();
  const key = targetOf(pathname);
  const withProfile = hasProfile(me);

  if (!me || pathname.startsWith("/profil") || pathname.startsWith("/admin")) return null;
  const name = activeName(me);
  const next = encodeURIComponent(pathname);

  // Gast mit vorbereitetem Profil: Einschätzungen gibt es erst angemeldet.
  const draftOnly = hasDraftOnly(me);
  const register = draftOnly ? (
    <Link href="/profil?speichern=1" className="shrink-0 rounded-full bg-slate-900 px-3 py-0.5 font-medium text-white hover:bg-slate-700">
      Anmelden und Einschätzung sehen →
    </Link>
  ) : null;

  // Detailseiten zeigen den Status oben rechts am Titel (RelevanceStatus);
  // die Zeile bleibt dort nur für die Registrierung.
  let content: React.ReactNode;
  if (draftOnly) {
    content = (
      <span className="text-slate-600">
        Das Profil <span className="font-medium text-slate-900">{name}</span> ist vorbereitet. Die Einschätzung sehen Sie nach der Anmeldung.
      </span>
    );
  } else if (!withProfile) {
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
  } else if (key) {
    return null;
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
        {register}
      </div>
    </div>
  );
}
