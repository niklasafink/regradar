// Logos der veröffentlichenden Behörden und Organe. Die Dateien liegen in
// public/authorities und stammen von Wikimedia Commons bzw. Wikipedia
// (offizielle Logos, nur zur Kennzeichnung der Quelle verwendet).
import { authority } from "@/lib/logic";

/* Quelle (Domain) -> Logodatei */
const LOGOS: Record<string, string> = {
  "eur-lex.europa.eu": "eu.svg",
  "consilium.europa.eu": "eu.svg",
  "esas-joint-committee.europa.eu": "eu.svg",
  "eba.europa.eu": "eba.svg",
  "esma.europa.eu": "esma.png",
  "eiopa.europa.eu": "eiopa.svg",
  "amla.europa.eu": "amla.svg",
  "srb.europa.eu": "srb.svg",
  "bankingsupervision.europa.eu": "ezb.svg",
  "bafin.de": "bafin.svg",
  "bundesbank.de": "bundesbank.svg",
  "bundesfinanzministerium.de": "bmf.svg",
  "bmi.bund.de": "bmi.svg",
  "dip.bundestag.de": "bundestag.svg",
  "bundesgerichtshof.de": "bgh.svg",
  "recht.bund.de": "de.svg",
  "gesetze-im-internet.de": "de.svg",
  "ec.europa.eu": "eu.svg",
  "curia.europa.eu": "eu.svg",
  "edpb.europa.eu": "eu.svg",
  "esrb.europa.eu": "eu.svg",
  "bsi.bund.de": "de.svg",
  "bfdi.bund.de": "de.svg",
  "zoll.de": "de.svg",
};

/* Rahmenwerk -> herausgebende Stelle (Domain wie in LOGOS/AUTHORITIES). */
export const FRAMEWORK_AUTH: Record<string, string> = {
  dora: "eur-lex.europa.eu",
  nis2: "eur-lex.europa.eu",
  ebaict: "eba.europa.eu",
  amla: "amla.europa.eu",
  gwg: "gesetze-im-internet.de",
  crr3: "eur-lex.europa.eu",
  marisk: "bafin.de",
  brrd: "eur-lex.europa.eu",
  ifr: "eur-lex.europa.eu",
  outsourcing: "eba.europa.eu",
  hinschg: "gesetze-im-internet.de",
  mifid: "eur-lex.europa.eu",
  mar: "eur-lex.europa.eu",
  priips: "eur-lex.europa.eu",
  psd3: "eur-lex.europa.eu",
  instant: "eur-lex.europa.eu",
  mica: "eur-lex.europa.eu",
  dltpilot: "eur-lex.europa.eu",
  aifmd2: "eur-lex.europa.eu",
  eltif: "eur-lex.europa.eu",
  mmf: "eur-lex.europa.eu",
  sfdr: "eur-lex.europa.eu",
  itsrep: "eba.europa.eu",
  anacredit: "bankingsupervision.europa.eu",
  solvency: "eur-lex.europa.eu",
  idd: "eur-lex.europa.eu",
  dsgvo: "eur-lex.europa.eu",
  aiact: "eur-lex.europa.eu",
  eidas2: "eur-lex.europa.eu",
  csrd: "eur-lex.europa.eu",
  consumer: "gesetze-im-internet.de",
};

/* Big-4- bzw. Kanzlei-Name (adv.f aus live.json) -> Logodatei in public/firms.
   Höhen pro Firma justiert, damit die Wortmarken optisch gleich groß wirken
   (die Deloitte-Marke ist sonst deutlich dominanter). */
const FIRM_LOGOS: Record<string, { file: string; h: string; hLg: string }> = {
  PwC: { file: "pwc.svg", h: "h-4", hLg: "h-5" },
  "PwC Legal": { file: "pwc.svg", h: "h-4", hLg: "h-5" },
  KPMG: { file: "kpmg.svg", h: "h-3.5", hLg: "h-4" },
  "Deloitte Legal": { file: "deloitte.svg", h: "h-2.5", hLg: "h-3" },
  "Waldeck Rechtsanwälte": { file: "waldeck.png", h: "h-4", hLg: "h-5" },
};

/** Logo einer Beratungsgesellschaft/Kanzlei; Fallback ist der Name als Text. */
export function FirmLogo({
  firm,
  large = false,
}: {
  firm: string;
  /** true = größere Variante (Detailseite), false = Listenzeile */
  large?: boolean;
}) {
  const logo = FIRM_LOGOS[firm];
  if (!logo) {
    return <span className="text-xs font-medium text-slate-600">{firm}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/firms/${logo.file}`}
      alt={firm}
      loading="lazy"
      className={`w-auto max-w-full object-contain object-left ${large ? logo.hLg : logo.h}`}
    />
  );
}

export function AuthorityLogo({
  src,
  className = "h-5",
  decorative = false,
}: {
  /** Quell-Domain, z. B. "eba.europa.eu" */
  src: string;
  className?: string;
  /** true, wenn der Behördenname direkt daneben steht */
  decorative?: boolean;
}) {
  const file = LOGOS[src];
  if (!file) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/authorities/${file}`}
      alt={decorative ? "" : authority(src)}
      aria-hidden={decorative || undefined}
      loading="lazy"
      className={`w-auto max-w-28 object-contain object-left ${className}`}
    />
  );
}
