// Anzeigename eines Instituts. Das BaFin-Register und die EZB-Liste führen
// bei manchen Instituten den Sitz im Namen („Debeka Bausparkasse
// Aktiengesellschaft Sitz Koblenz am Rhein“, „Sparkasse Niederlausitz mit
// Sitz in Senftenberg“, „… eG, based in Korbach“). Angezeigt wird nur der
// Name der Gesellschaft (Nutzerentscheidung 13.11.2026). Sitzangaben, die
// zum amtlichen Namen gehören („Mittelbrandenburgische Sparkasse in
// Potsdam“), bleiben stehen. Die Rohnamen bleiben für Register- und
// GLEIF-Abgleiche unverändert.

const SEAT = /\s*,?\s+(?:mit\s+)?Sitz(?:\s+in)?\s+\S.*$|\s*,\s*based\s+in\s+\S.*$/i;

export function displayName(name: string): string {
  const s = name.replace(SEAT, "").trim();
  return s.length >= 3 ? s : name.trim();
}
