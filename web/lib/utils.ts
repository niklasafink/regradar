import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-Konvention: Klassen zusammenführen, Tailwind-Konflikte auflösen. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
