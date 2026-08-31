import type { Metadata } from "next";
import { Instrument_Serif, Inter, Manrope } from "next/font/google";
import { CookieConsent } from "@/components/cookie-consent";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-app",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3001"),
  title: "Regulatory Radar",
  description:
    "Kostenloser Regulatory Monitor für Banken, Asset Manager und andere Finanzunternehmen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${inter.variable} ${manrope.variable} ${instrumentSerif.variable} font-sans`}>
        {/* DataFast-Queue: puffert Goal-/Identify-Aufrufe, bis das Script nach
            Einwilligung (CookieConsent) geladen wird — ohne Consent lädt nichts */}
        <script
          id="datafast-queue"
          dangerouslySetInnerHTML={{
            __html:
              "window.datafast=window.datafast||function(){window.datafast.q=window.datafast.q||[];window.datafast.q.push(arguments);};",
          }}
        />
        <StoreProvider>
          {children}
          <CookieConsent />
        </StoreProvider>
      </body>
    </html>
  );
}
