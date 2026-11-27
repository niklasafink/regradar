// Einheitliches Icon-Set für Themengebiete und Institutsarten (Lucide, Linie
// 1.5). Die Icons sind rein dekorativ; der Text daneben trägt die Bedeutung.
import {
  ArrowLeftRight, Briefcase, ChartPie, Cpu, CreditCard, Database, FileText,
  Landmark, LayoutGrid, Leaf, Network, Search, ShieldCheck, ShoppingBag,
  TrendingUp, Umbrella, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  // Institutsarten
  CI: Landmark, AM: Briefcase, IF: ArrowLeftRight, PI: CreditCard, INS: Umbrella, OTH: LayoutGrid,
  // Themengebiete
  ICT: Cpu, AML: Search, PRU: ShieldCheck, GOV: Network, MKT: TrendingUp, PAY: CreditCard,
  INSU: Umbrella, ESG: Leaf, DATA: Database, CONS: ShoppingBag, FND: ChartPie, REP: FileText,
};

/** Icon zu einer Institutsart- oder Themen-ID; unbekannte IDs zeigen nichts. */
export function Icon({ id, className = "size-4" }: { id: string; className?: string }) {
  const Glyph = ICONS[id];
  return Glyph ? <Glyph aria-hidden strokeWidth={1.5} className={`shrink-0 ${className}`} /> : null;
}
