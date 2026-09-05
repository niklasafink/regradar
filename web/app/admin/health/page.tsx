// Statusseite der Scraper-Überwachung. Zugang nur mit signiertem Token (?t=),
// wie er in den Alarm-Mails steckt; ohne gültiges Token 404. Mit ?repair=<id>
// (Button in der Mail) startet die Seite beim Öffnen den Reparaturauftrag.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyHealthToken } from "@/lib/health";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scraper-Status – Regulatory Radar",
  robots: { index: false, follow: false },
};

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  if (!verifyHealthToken(t)) notFound();
  const repair = typeof sp.repair === "string" && /^[a-z0-9_]{1,40}$/.test(sp.repair) ? sp.repair : "";
  return <Dashboard token={t} autoRepair={repair} />;
}
