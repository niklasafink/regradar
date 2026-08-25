import type { Metadata } from "next";
import { Chrome, SlimFooter } from "@/components/chrome";

export const metadata: Metadata = {
  title: "Impressum · Regulatory Radar",
  robots: { index: false },
};

export default function Impressum() {
  return (
    <>
      <Chrome />
      <main className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6">
        <h1 className="font-heading text-3xl font-medium tracking-tight">Impressum</h1>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-600 [&_h2]:font-heading [&_h2]:text-base [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_p]:mt-2">
          <section>
            <h2>Angaben gemäß § 5 DDG</h2>
            <p>
              Neura Labs UG (haftungsbeschränkt)
              <br />
              Auf der Heidwende 7
              <br />
              27726 Worpswede
              <br />
              Deutschland
            </p>
            <p>Regulatory Radar ist ein Angebot der Neura Labs UG (haftungsbeschränkt).</p>
          </section>

          <section>
            <h2>Vertreten durch</h2>
            <p>Geschäftsführer: Moritz Landwehr</p>
          </section>

          <section>
            <h2>Kontakt</h2>
            <p>
              E-Mail:{" "}
              <a href="mailto:info@conformisgrc.com" className="underline underline-offset-2 hover:text-slate-900">
                info@conformisgrc.com
              </a>
            </p>
          </section>

          <section>
            <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
            <p>
              Moritz Landwehr
              <br />
              Auf der Heidwende 7
              <br />
              27726 Worpswede
            </p>
          </section>

          <section>
            <h2>EU-Streitschlichtung</h2>
            <p>
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
              bereit:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-slate-900"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
              . Unsere E-Mail-Adresse finden Sie oben im Impressum.
            </p>
          </section>

          <section>
            <h2>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
            <p>
              Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </section>

          <section>
            <h2>Zentrale Kontaktstelle nach dem Digital Services Act – DSA (Verordnung (EU) 2022/2065)</h2>
            <p>
              Unsere zentrale Kontaktstelle für Nutzer und Behörden nach Art. 11, 12 DSA erreichen
              Sie wie folgt:
              <br />
              E-Mail:{" "}
              <a href="mailto:info@conformisgrc.com" className="underline underline-offset-2 hover:text-slate-900">
                info@conformisgrc.com
              </a>
            </p>
            <p>Die für den Kontakt zur Verfügung stehenden Sprachen sind: Deutsch, Englisch.</p>
          </section>

          <section>
            <h2>Keine Abmahnung ohne vorherigen Kontakt</h2>
            <p>
              Falls der Inhalt oder die Gestaltung dieser Seiten Rechte Dritter oder gesetzliche
              Bestimmungen verletzt, bitten wir um eine Nachricht vorab ohne Schreiben mit
              Aufforderung zur Zahlung einer Schadensersatzsumme. Eine durch den Rechteinhaber
              selbst durchgeführte Beseitigung einer möglicherweise bestehenden
              Schutzrechtsverletzung darf nicht ohne unsere Zustimmung erfolgen. Wir sichern zu,
              dass rechtmäßig beanstandete Inhalte unverzüglich entfernt werden, ohne dass von
              Ihrer Seite die Einschaltung eines Rechtsanwalts erforderlich ist. Unsere Seiten
              werden mit größtmöglicher Sorgfalt erstellt, und wir beabsichtigen keinesfalls,
              gegen geltendes Recht zu verstoßen. Sollten wir Abmahnungen erhalten, leiten wir
              diese an unsere zuständige Kanzlei weiter.
            </p>
          </section>
        </div>
      </main>
      <SlimFooter />
    </>
  );
}
