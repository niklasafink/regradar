import type { Metadata } from "next";
import { Chrome, SlimFooter } from "@/components/chrome";
import { ConsentSettingsLink } from "@/components/cookie-consent";

export const metadata: Metadata = {
  title: "Datenschutzerklärung · Regulatory Radar",
  robots: { index: false },
};

export default function Datenschutz() {
  return (
    <>
      <Chrome />
      <main className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6">
        <h1 className="font-heading text-3xl font-medium tracking-tight">Datenschutzerklärung</h1>

        <div className="mt-8 space-y-10 text-sm leading-relaxed text-slate-600 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_h3]:mt-5 [&_h3]:font-medium [&_h3]:text-slate-900 [&_p]:mt-2">
          <section>
            <h2>1. Datenschutz auf einen Blick</h2>

            <h3>Allgemeine Hinweise</h3>
            <p>
              Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren
              personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene
              Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.
            </p>

            <h3>Datenerfassung auf dieser Website</h3>
            <p>
              <strong className="text-slate-900">Wer ist verantwortlich für die Datenerfassung auf dieser Website?</strong>
              <br />
              Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Dessen
              Kontaktdaten können Sie dem Abschnitt „Verantwortliche Stelle“ in dieser
              Datenschutzerklärung entnehmen.
            </p>
            <p>
              <strong className="text-slate-900">Wie erfassen wir Ihre Daten?</strong>
              <br />
              Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen, zum
              Beispiel bei der Anmeldung zu unserem E-Mail-Newsletter. Andere Daten werden
              automatisch beim Besuch der Website durch unsere IT-Systeme erfasst, etwa technische
              Daten wie Internetbrowser, Betriebssystem oder die Uhrzeit des Seitenaufrufs.
            </p>
            <p>
              <strong className="text-slate-900">Wofür nutzen wir Ihre Daten?</strong>
              <br />
              Ein Teil der Daten wird erhoben, um eine fehlerfreie Bereitstellung der Website zu
              gewährleisten. Andere Daten werden verwendet, um Ihnen die von Ihnen abonnierten
              Update-Benachrichtigungen zuzusenden und Ihre Anfragen zu bearbeiten.
            </p>
            <p>
              <strong className="text-slate-900">Welche Rechte haben Sie bezüglich Ihrer Daten?</strong>
              <br />
              Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und
              Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben außerdem
              ein Recht, die Berichtigung oder Löschung dieser Daten zu verlangen. Wenn Sie eine
              Einwilligung zur Datenverarbeitung erteilt haben, können Sie diese Einwilligung
              jederzeit für die Zukunft widerrufen. Außerdem haben Sie das Recht, unter bestimmten
              Umständen die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten zu
              verlangen. Des Weiteren steht Ihnen ein Beschwerderecht bei der zuständigen
              Aufsichtsbehörde zu.
            </p>
          </section>

          <section>
            <h2>2. Hosting</h2>
            <p>
              Diese Website wird bei Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA,
              gehostet. Die personenbezogenen Daten, die auf dieser Website erfasst werden, werden
              auf den Servern des Hosters verarbeitet. Hierbei kann es sich vor allem um
              IP-Adressen, Kontaktanfragen, Meta- und Kommunikationsdaten und sonstige Daten
              handeln, die über eine Website generiert werden.
            </p>
            <p>
              Das externe Hosting erfolgt zum Zweck der Vertragserfüllung gegenüber unseren
              potenziellen und bestehenden Nutzern nach Art. 6 Abs. 1 lit. b DSGVO und im
              Interesse einer sicheren, schnellen und effizienten Bereitstellung unseres
              Online-Angebots durch einen professionellen Anbieter nach Art. 6 Abs. 1 lit. f
              DSGVO. Wir haben mit Vercel einen Vertrag über Auftragsverarbeitung nach Art. 28
              DSGVO geschlossen. Die Übermittlung von Daten in die USA stützt sich auf die
              Standardvertragsklauseln der EU-Kommission sowie auf die Zertifizierung von Vercel
              unter dem EU-US Data Privacy Framework.
            </p>
          </section>

          <section>
            <h2>3. Cookies und Analyse-Tools</h2>

            <h3>Cookies und Einwilligung</h3>
            <p>
              Diese Website verwendet technisch notwendige Speichertechnologien (etwa für die
              Sprachauswahl und das Speichern Ihrer Cookie-Einstellung im lokalen Speicher Ihres
              Browsers). Diese sind für den Betrieb der Website erforderlich; Rechtsgrundlage ist
              § 25 Abs. 2 TDDDG sowie Art. 6 Abs. 1 lit. f DSGVO.
            </p>
            <p>
              Darüber hinausgehende Analyse-Cookies setzen wir nur mit Ihrer Einwilligung nach
              § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO, die Sie über unseren
              Cookie-Banner erteilen. Sie können Ihre Einwilligung jederzeit mit Wirkung für die
              Zukunft widerrufen oder anpassen: <ConsentSettingsLink className="underline underline-offset-2" />
            </p>

            <h3>DataFast (Webanalyse)</h3>
            <p>
              Sofern Sie darin eingewilligt haben, nutzen wir den Analysedienst DataFast
              (datafa.st) des Anbieters JustShipIt Pte. Ltd., Singapur, um die Nutzung unserer
              Website auszuwerten (z.&nbsp;B. aufgerufene Seiten, Herkunftsquelle, Browser,
              Land). DataFast setzt hierzu einen Cookie mit einer zufälligen Besucherkennung
              (Speicherdauer 12 Monate), um wiederkehrende Besucher zu erkennen und
              Nutzungsverläufe zuzuordnen.
            </p>
            <p>
              Wenn Sie sich für unseren Newsletter anmelden, verknüpfen wir Ihre E-Mail-Adresse
              mit diesem Besuchsprofil, um zu verstehen, über welche Wege Nutzer zu unserem
              Newsletter finden und wie unser Angebot genutzt wird. Rechtsgrundlage für den
              Einsatz von DataFast einschließlich dieser Verknüpfung ist Ihre Einwilligung nach
              Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG; ohne Einwilligung wird DataFast
              nicht geladen und es findet keine Verknüpfung statt. Sie können Ihre Einwilligung
              jederzeit über die <ConsentSettingsLink className="underline underline-offset-2" />{" "}
              mit Wirkung für die Zukunft widerrufen.
            </p>
            <p>
              Wir haben mit dem Anbieter einen Vertrag über Auftragsverarbeitung nach Art. 28
              DSGVO geschlossen. Die Verarbeitung erfolgt teilweise außerhalb der EU (unter
              anderem in den USA und in Singapur); die Übermittlung stützt sich auf die
              Standardvertragsklauseln der EU-Kommission. Die Daten werden gelöscht, sobald sie
              für die genannten Zwecke nicht mehr erforderlich sind; Sie können die Löschung
              jederzeit bei uns verlangen.
            </p>

            <h3>Google Analytics</h3>
            <p>
              Sofern Sie darin eingewilligt haben, nutzt diese Website Google Analytics, einen
              Webanalysedienst der Google Ireland Limited, Gordon House, Barrow Street, Dublin 4,
              Irland. Google Analytics verwendet Cookies und ähnliche Technologien, die eine
              Analyse Ihrer Nutzung der Website ermöglichen. Die dabei erzeugten Informationen
              werden in der Regel an Server von Google übertragen und dort verarbeitet; dabei
              kann es auch zu einer Übermittlung in die USA kommen. Google LLC ist unter dem
              EU-US Data Privacy Framework zertifiziert; ergänzend gelten die
              Standardvertragsklauseln der EU-Kommission. Die IP-Adresse wird vor der
              Verarbeitung gekürzt (IP-Anonymisierung).
            </p>
            <p>
              Rechtsgrundlage ist ausschließlich Ihre Einwilligung nach Art. 6 Abs. 1 lit. a
              DSGVO und § 25 Abs. 1 TDDDG. Ohne Einwilligung wird Google Analytics nicht geladen.
              Sie können Ihre Einwilligung jederzeit über die{" "}
              <ConsentSettingsLink className="underline underline-offset-2" /> widerrufen.
              Weitere Informationen finden Sie in der Datenschutzerklärung von Google:{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-slate-900"
              >
                https://policies.google.com/privacy
              </a>
              .
            </p>
          </section>

          <section>
            <h2>4. Allgemeine Hinweise und Pflichtinformationen</h2>

            <h3>Datenschutz</h3>
            <p>
              Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst.
              Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend den
              gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung.
            </p>
            <p>
              Wir weisen darauf hin, dass die Datenübertragung im Internet Sicherheitslücken
              aufweisen kann. Ein lückenloser Schutz der Daten vor dem Zugriff durch Dritte ist
              nicht möglich.
            </p>

            <h3>Verantwortliche Stelle</h3>
            <p>Die verantwortliche Stelle für die Datenverarbeitung auf dieser Website ist:</p>
            <p>
              Neura Labs UG (haftungsbeschränkt)
              <br />
              Auf der Heidwende 7
              <br />
              27726 Worpswede
              <br />
              Vertreten durch: Moritz Landwehr
              <br />
              E-Mail:{" "}
              <a href="mailto:info@conformisgrc.com" className="underline underline-offset-2 hover:text-slate-900">
                info@conformisgrc.com
              </a>
            </p>

            <h3>Speicherdauer</h3>
            <p>
              Soweit innerhalb dieser Datenschutzerklärung keine speziellere Speicherdauer genannt
              wurde, verbleiben Ihre personenbezogenen Daten bei uns, bis der Zweck für die
              Datenverarbeitung entfällt. Wenn Sie ein berechtigtes Löschersuchen geltend machen
              oder eine Einwilligung zur Datenverarbeitung widerrufen, werden Ihre Daten gelöscht,
              sofern wir keine anderen rechtlich zulässigen Gründe für die Speicherung haben.
            </p>
          </section>

          <section>
            <h2>5. Ihre Rechte</h2>

            <h3>Auskunft, Berichtigung und Löschung</h3>
            <p>
              Sie haben im Rahmen der geltenden gesetzlichen Bestimmungen jederzeit das Recht auf
              unentgeltliche Auskunft über Ihre gespeicherten personenbezogenen Daten, deren
              Herkunft und Empfänger und den Zweck der Datenverarbeitung sowie gegebenenfalls ein
              Recht auf Berichtigung oder Löschung dieser Daten.
            </p>

            <h3>Recht auf Einschränkung der Verarbeitung</h3>
            <p>
              Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen
              Daten zu verlangen, wenn die Richtigkeit der Daten bestritten wird, die Verarbeitung
              unrechtmäßig ist oder Sie die Daten zur Geltendmachung von Rechtsansprüchen
              benötigen.
            </p>

            <h3>Beschwerderecht</h3>
            <p>
              Im Falle von Verstößen gegen die DSGVO steht den Betroffenen ein Beschwerderecht bei
              einer Aufsichtsbehörde zu, insbesondere in dem Mitgliedstaat ihres gewöhnlichen
              Aufenthalts, ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes.
            </p>

            <h3>Recht auf Datenübertragbarkeit</h3>
            <p>
              Sie haben das Recht, Daten, die wir auf Grundlage Ihrer Einwilligung oder in
              Erfüllung eines Vertrags automatisiert verarbeiten, an sich oder an einen Dritten in
              einem gängigen, maschinenlesbaren Format aushändigen zu lassen.
            </p>
          </section>

          <section>
            <h2>6. Newsletter und Kontakt</h2>

            <h3>E-Mail-Newsletter</h3>
            <p>
              Wenn Sie sich für unseren Newsletter anmelden, speichern wir Ihre E-Mail-Adresse, um
              Ihnen Benachrichtigungen über neue regulatorische Updates zuzusenden. Die Anmeldung
              erfolgt im Double-Opt-in-Verfahren: Sie erhalten nach der Eintragung eine E-Mail mit
              einem Bestätigungslink; erst nach Bestätigung ist die Anmeldung aktiv. Die
              Verarbeitung erfolgt auf Grundlage Ihrer Einwilligung nach Art. 6 Abs. 1 lit. a
              DSGVO. Sie können den Newsletter jederzeit über den Abmeldelink in jeder E-Mail oder
              per Nachricht an uns abbestellen; Ihre E-Mail-Adresse wird danach gelöscht.
            </p>
            <p>
              Für den Versand nutzen wir den Dienstleister Resend (Resend, Inc., 2261 Market
              Street #5039, San Francisco, CA 94114, USA) auf Grundlage eines Vertrags über
              Auftragsverarbeitung nach Art. 28 DSGVO. Die Übermittlung in die USA stützt sich
              auf die Standardvertragsklauseln der EU-Kommission.
            </p>

            <h3>Kontaktanfragen</h3>
            <p>
              Wenn Sie uns per E-Mail kontaktieren, werden Ihre Angaben inklusive der von Ihnen
              angegebenen Kontaktdaten zur Bearbeitung der Anfrage bei uns gespeichert. Diese
              Daten geben wir nicht ohne Ihre Einwilligung weiter. Die Verarbeitung erfolgt auf
              Grundlage von Art. 6 Abs. 1 lit. b DSGVO.
            </p>

            <h3>SSL- beziehungsweise TLS-Verschlüsselung</h3>
            <p>
              Diese Seite nutzt aus Sicherheitsgründen eine SSL- beziehungsweise
              TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen Sie daran, dass die
              Adresszeile des Browsers von „http://“ auf „https://“ wechselt.
            </p>

            <h3>Widerspruch gegen Werbe-E-Mails</h3>
            <p>
              Der Nutzung von im Rahmen der Impressumspflicht veröffentlichten Kontaktdaten zur
              Übersendung von nicht ausdrücklich angeforderter Werbung wird hiermit widersprochen.
            </p>
          </section>
        </div>
      </main>
      <SlimFooter />
    </>
  );
}
