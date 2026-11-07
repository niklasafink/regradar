import type { Metadata } from "next";
import { Chrome, SlimFooter } from "@/components/chrome";
import { TrackGoal } from "@/components/track-goal";
import catalog from "@/lib/relevance/catalog.json";
import { ProfilClient } from "./profil-client";

export const metadata: Metadata = {
  title: "Institutsprofil: Welche Updates sind einschlägig? · Regulatory Radar",
  robots: { index: false },
};

/* Profil-Ablauf: Institut suchen, Erlaubnisse und Merkmale prüfen,
   Vorschau der Einschlägigkeit, dann speichern (Konto per Magic Link). */
export default function ProfilPage() {
  const art = catalog.features.filter((f) => f.g === "art").map((f) => ({ id: f.id, l: f.l }));
  const erl = catalog.features.filter((f) => f.g === "erl").map((f) => ({ id: f.id, l: f.l }));
  return (
    <>
      <TrackGoal goal="profile_screen_viewed" />
      <Chrome />
      <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
        <ProfilClient art={art} erl={erl} />
      </main>
      <SlimFooter />
    </>
  );
}
