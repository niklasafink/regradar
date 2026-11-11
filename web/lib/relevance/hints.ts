// Entscheidungshilfen zu den Rückfragen im Institutsprofil: was das Merkmal
// bedeutet, Prüffragen, an denen man es entscheiden kann, und wo man im
// eigenen Haus nachsieht. Kein Server-Import, wird auch im Browser genutzt.
// Bewusst getrennt von catalog.json (das geht in die Analyse-Prompts).

export interface Hint {
  /** Ein bis zwei Sätze: was gemeint ist. */
  hinweis: string;
  /** Prüffragen; trifft eine zu, ist die Antwort meist „Ja“. */
  pruefen: string[];
  /** Wo man nachsieht. */
  quelle?: string;
}

export const HINTS: Record<string, Hint> = {
  snci: {
    hinweis: "Kleines und nicht komplexes Institut nach Art. 4 Abs. 1 Nr. 145 CRR. Alle Bedingungen müssen gleichzeitig erfüllt sein; dann gelten Erleichterungen bei Offenlegung, Meldewesen, Vergütung und Liquidität (NSFR vereinfacht).",
    pruefen: [
      "Liegt die Bilanzsumme im Durchschnitt der letzten vier Jahre bei höchstens 5 Mrd. €?",
      "Ist das Institut kein großes Institut (kein G-SRI/A-SRI, keines der drei größten im Land)?",
      "Ist die Handelsbuchtätigkeit klein im Sinne von Art. 94 CRR und machen Handels-Derivate höchstens 2 % (alle Derivate höchstens 5 %) der Aktiva aus?",
      "Stammen mehr als 75 % der Aktiva und Passiva von Gegenparteien im EWR?",
      "Nutzt das Institut keine internen Modelle und hat es der Einstufung als SNCI nicht widersprochen?",
    ],
    quelle: "Offenlegungsbericht (Säule 3), Meldewesen-Abteilung, Schreiben der Aufsicht zur Einstufung",
  },
  bedeutend_ivv: {
    hinweis: "Bedeutendes Institut im Sinne von § 1 Abs. 3c KWG und § 17 Institutsvergütungsverordnung. Daran hängen zusätzliche Vergütungspflichten, etwa die Risikoanalyse für Risikoträger und ein Vergütungsbeauftragter.",
    pruefen: [
      "Lag die Bilanzsumme im Durchschnitt der letzten drei Geschäftsjahre bei 15 Mrd. € oder mehr?",
      "Wird das Institut direkt von der EZB beaufsichtigt (SI) oder ist es als A-SRI/G-SRI eingestuft? Dann gilt es stets als bedeutend.",
      "Hat das Institut bisher eine Risikoträger-Analyse nach § 25a Abs. 5b KWG durchgeführt oder einen Vergütungsbeauftragten bestellt?",
    ],
    quelle: "Vergütungsbericht, Personalabteilung, Jahresabschlüsse der letzten drei Jahre",
  },
  osii: {
    hinweis: "Anderweitig systemrelevantes Institut (A-SRI, englisch O-SII). Die BaFin legt jährlich fest, welche Institute dazu gehören; dann gilt ein zusätzlicher Kapitalpuffer.",
    pruefen: [
      "Steht das Institut oder seine Gruppe auf der aktuellen A-SRI-Liste der BaFin?",
      "Weist der Offenlegungsbericht einen A-SRI-Puffer aus?",
    ],
    quelle: "A-SRI-Liste auf bafin.de, Offenlegungsbericht (Kapitalpuffer)",
  },
  irb: {
    hinweis: "Das Institut rechnet Eigenmittelanforderungen mit aufsichtlich genehmigten internen Ansätzen statt mit Standardansätzen: IRB-Ansatz für Kreditrisiken oder interne Modelle für Marktrisiken.",
    pruefen: [
      "Gibt es eine Genehmigung der BaFin oder EZB für den IRB-Ansatz oder ein internes Marktrisikomodell?",
      "Weist der Offenlegungsbericht (Tabelle EU OV1) risikogewichtete Aktiva im IRB-Ansatz aus?",
    ],
    quelle: "Offenlegungsbericht, Tabelle EU OV1; Risikocontrolling",
  },
  handelsbuch_klein: {
    hinweis: "Handelsbuchtätigkeit von geringem Umfang nach Art. 94 CRR. Dann darf das Institut Handelsbuchpositionen wie Anlagebuchpositionen behandeln.",
    pruefen: [
      "Liegen die Handelsbuchpositionen monatlich bei höchstens 5 % der Gesamtaktiva und höchstens 50 Mio. €?",
      "Wurden 6 % bzw. 60 Mio. € zu keinem Zeitpunkt überschritten?",
      "Führt das Institut gar kein Handelsbuch (reines Nichthandelsbuchinstitut)? Dann ebenfalls „Ja“.",
    ],
    quelle: "Meldewesen (COREP), Handelsbuchstatut bzw. Organisationsrichtlinie",
  },
  gruppe_uebergeordnet: {
    hinweis: "Das Institut steht an der Spitze einer Institutsgruppe oder ist innerhalb einer Finanzholding-Gruppe für die konsolidierten Pflichten verantwortlich (Art. 11 CRR, § 10a KWG). Dann gelten Eigenmittel-, Melde- und Offenlegungspflichten zusätzlich auf Gruppenebene.",
    pruefen: [
      "Hält das Institut Tochtergesellschaften, die Institute, Finanzinstitute (z. B. Leasing- oder Factoringgesellschaften) oder Anbieter von Nebendienstleistungen sind?",
      "Wird das Institut von einer Finanzholding beherrscht, die nicht selbst nach § 2f KWG genehmigt ist? Dann ist meist das Institut für die Gruppe verantwortlich.",
      "Reicht das Institut konsolidierte COREP- oder FINREP-Meldungen ein?",
      "Erscheint im Offenlegungsbericht ein Konsolidierungskreis mit dem Institut als Meldepflichtigem?",
    ],
    quelle: "Offenlegungsbericht (Konsolidierungskreis, Tabelle EU LI3), Meldewesen, Konzernorganigramm",
  },
  gruppe_nachgeordnet: {
    hinweis: "Das Institut ist Tochter in einer Institutsgruppe; die Gruppenpflichten erfüllt ein anderes Unternehmen, das Institut liefert aber Daten zu und unterliegt Gruppenvorgaben.",
    pruefen: [
      "Gehört das Institut mehrheitlich zu einer Bank, Finanzholding oder einem Finanzkonzern?",
      "Liefert das Institut Daten für konsolidierte Meldungen eines Mutterunternehmens?",
    ],
    quelle: "Konzernorganigramm, Lagebericht",
  },
  kapitalmarktorientiert: {
    hinweis: "Kapitalmarktorientiert nach § 264d HGB: Das Unternehmen hat Wertpapiere an einem geregelten Markt in der EU oder im EWR zugelassen oder die Zulassung beantragt. Das gilt nicht nur für Aktien, sondern auch für Anleihen.",
    pruefen: [
      "Sind Aktien des Instituts an einem geregelten Markt notiert (z. B. Prime oder General Standard)?",
      "Hat das Institut Anleihen, Pfandbriefe, Nachrangpapiere oder Schuldverschreibungen aus einem Emissionsprogramm (z. B. EMTN) am geregelten Markt platziert?",
      "Wichtig: Eine Notierung nur im Freiverkehr (z. B. Open Market, Scale) zählt nicht.",
    ],
    quelle: "Wertpapierprospekte, Investor-Relations-Seite, Jahresabschluss (Angabe nach § 264d HGB)",
  },
  csrd_pflichtig: {
    hinweis: "Pflicht zur Nachhaltigkeitsberichterstattung nach CSRD und Taxonomie-Verordnung. Seit dem Omnibus-I-Paket gelten deutlich höhere Schwellen (u. a. mehr als 1.000 Beschäftigte); bis zur Umsetzung im HGB gilt in Deutschland weiter die nichtfinanzielle Erklärung.",
    pruefen: [
      "Gibt das Institut heute eine nichtfinanzielle Erklärung oder einen Nachhaltigkeitsbericht ab (§§ 289b, 340a Abs. 1a HGB)?",
      "Hat das Institut im Jahresdurchschnitt mehr als 1.000 Beschäftigte?",
      "Ist das Institut in einen Konzernbericht der Mutter einbezogen? Dann kann die eigene Pflicht entfallen; die Daten liefert es trotzdem zu.",
    ],
    quelle: "Lagebericht, Nachhaltigkeitsbericht, Personalstatistik",
  },
  sfdr_pflichtig: {
    hinweis: "Finanzmarktteilnehmer oder Finanzberater nach der Offenlegungsverordnung (SFDR): Wer Portfolios verwaltet, Fonds auflegt, Versicherungsanlageprodukte anbietet oder Anlage- bzw. Versicherungsberatung erbringt.",
    pruefen: [
      "Bietet das Institut Finanzportfolioverwaltung oder Anlageberatung an?",
      "Veröffentlicht das Institut bereits Informationen zu Nachhaltigkeitsrisiken auf seiner Website (Art. 3 SFDR)?",
    ],
    quelle: "Website (Nachhaltigkeitsbezogene Offenlegungen), Erlaubnisumfang",
  },
  finanzielle_gegenpartei: {
    hinweis: "Finanzielle Gegenpartei nach EMIR, etwa Kreditinstitut, Wertpapierfirma, Versicherer, KVG oder Pensionseinrichtung. Für sie gelten Melde-, Clearing- und Risikominderungspflichten bei Derivaten.",
    pruefen: [
      "Ist das Institut ein CRR-Kreditinstitut, eine Wertpapierfirma, ein Versicherer, eine KVG oder eine EbAV?",
      "Schließt es Derivate ab (auch nur zur Absicherung)?",
    ],
    quelle: "Erlaubnisumfang, EMIR-Meldewesen",
  },
  privatkunden: {
    hinweis: "Das Institut hat Geschäft mit Verbrauchern (§ 13 BGB) bzw. Privatkunden (§ 67 WpHG). Daran hängen Verbraucherschutzpflichten, Beschwerdemanagement, Produktfreigabe und Informationspflichten.",
    pruefen: [
      "Nimmt das Institut Tages- oder Festgeld von Privatpersonen an? Auch reine Einlagen zählen.",
      "Vergibt es Kredite oder Leasing an Verbraucher oder an Einzelpersonen außerhalb ihrer beruflichen Tätigkeit?",
      "Berät oder betreut es Privatanleger im Wertpapiergeschäft?",
      "Nur Geschäftskunden, Selbstständige und Freiberufler im Rahmen ihres Gewerbes? Dann eher „Nein“.",
    ],
    quelle: "Produktkatalog, Website (Privatkunden-Bereich), Einlagensicherungsangaben",
  },
  verbraucherkredit: {
    hinweis: "Allgemein-Verbraucherdarlehen und Finanzierungshilfen nach §§ 491 ff., 506 BGB. Relevant u. a. für die neue Verbraucherkreditrichtlinie (CCD II).",
    pruefen: [
      "Vergibt das Institut Ratenkredite, Dispositions- oder Rahmenkredite an Verbraucher?",
      "Bietet es Finanzierungsleasing oder Ratenkauf an Verbraucher an? Das gilt als entgeltliche Finanzierungshilfe.",
      "Vermittelt es Konsumentenkredite über Händler oder Plattformen (Point of Sale, Buy now pay later)?",
    ],
    quelle: "Produktkatalog, Kreditrisikostrategie",
  },
  wohnimmobilienkredit: {
    hinweis: "Immobiliar-Verbraucherdarlehen nach § 491 Abs. 3 BGB: Kredite an Verbraucher, die durch Grundpfandrechte gesichert sind oder dem Erwerb von Wohnimmobilien dienen.",
    pruefen: [
      "Finanziert das Institut Kauf, Bau oder Modernisierung von Wohneigentum für Privatpersonen?",
      "Vergibt es grundpfandrechtlich besicherte Kredite an Verbraucher?",
    ],
    quelle: "Kreditportfolio-Bericht, Produktkatalog",
  },
  gewerbeimmobilienkredit: {
    hinweis: "Finanzierung von Gewerbeimmobilien (Büro, Handel, Logistik, Hotel) oder Wohnimmobilien als Renditeobjekt. Im Fokus der Aufsicht bei Bewertung und Risikovorsorge.",
    pruefen: [
      "Finanziert das Institut Immobilien, deren Mieterträge den Kredit bedienen?",
      "Gibt es im Kreditportfolio eine Position „Commercial Real Estate“?",
    ],
    quelle: "Offenlegungsbericht (Kreditrisiko nach Branchen), Risikobericht",
  },
  immo_ausland: {
    hinweis: "Immobilienfinanzierungen in anderen EU-Staaten. Dort gelten teils eigene makroprudenzielle Vorgaben (z. B. Beleihungs- und Schuldendienstgrenzen in Österreich).",
    pruefen: ["Liegen finanzierte Immobilien außerhalb Deutschlands, etwa in Österreich, den Niederlanden oder Luxemburg?"],
    quelle: "Kreditportfolio nach Ländern",
  },
  zahlungskonten: {
    hinweis: "Das Institut führt Zahlungskonten (Girokonten, Geschäftskonten mit Überweisungsfunktion) für Kunden. Relevant für PSD, Instant Payments und das Zahlungskontengesetz.",
    pruefen: [
      "Können Kunden von ihrem Konto Überweisungen an Dritte ausführen?",
      "Reine Tages- oder Festgeldkonten mit Auszahlung nur auf ein Referenzkonto sind meist keine Zahlungskonten.",
    ],
    quelle: "Produktbedingungen, Preis- und Leistungsverzeichnis",
  },
  kartengeschaeft: {
    hinweis: "Ausgabe von Zahlungskarten (Debit, Kredit, Prepaid) oder Akzeptanz von Kartenzahlungen für Händler (Acquiring).",
    pruefen: [
      "Gibt das Institut Karten aus, auch über einen Partner im eigenen Namen?",
      "Rechnet es Kartenzahlungen für Händler ab?",
    ],
    quelle: "Produktkatalog, Verträge mit Kartenorganisationen",
  },
  otc_derivate: {
    hinweis: "Nicht zentral geclearte OTC-Derivate nach EMIR. Auch Geschäfte, die nur der Absicherung dienen, zählen. Dann gelten Besicherungs- (Margin) und Risikominderungspflichten.",
    pruefen: [
      "Schließt das Institut Zinsswaps, Zinscaps oder Cross-Currency-Swaps ab, etwa zur Absicherung der Refinanzierung?",
      "Nutzt es Devisentermingeschäfte (FX-Forwards) oder Devisenswaps?",
      "Werden diese Geschäfte bilateral mit einer Bank abgeschlossen und nicht über eine zentrale Gegenpartei?",
    ],
    quelle: "Anhang des Jahresabschlusses (derivative Finanzinstrumente), Treasury, EMIR-Meldungen",
  },
  verbriefung_originator: {
    hinweis: "Originator oder Sponsor einer Verbriefung nach Art. 2 der Verbriefungsverordnung: Forderungen werden in Tranchen mit unterschiedlichem Risiko an Investoren weitergegeben.",
    pruefen: [
      "Verkauft das Institut Forderungen (z. B. Leasing-, Kredit- oder Autoforderungen) an eine Zweckgesellschaft?",
      "Nutzt es ABCP-Programme von Banken zur Refinanzierung? Auch das ist regelmäßig eine Verbriefung.",
      "Gibt es synthetische Verbriefungen oder Kreditrisikoabsicherungen über Tranchen?",
    ],
    quelle: "Refinanzierungsübersicht im Lagebericht, Anhang (strukturierte Unternehmen), Treasury",
  },
  verbriefung_investor: {
    hinweis: "Das Institut hält Verbriefungspositionen (ABS, RMBS, CLO, ABCP). Dann gelten Sorgfaltspflichten für Investoren nach Art. 5 Verbriefungsverordnung.",
    pruefen: [
      "Enthält das Depot A oder die Liquiditätsreserve ABS, RMBS oder CLO?",
      "Hält das Institut Anteile an Fonds, die überwiegend in Verbriefungen investieren?",
    ],
    quelle: "Depot-A-Aufstellung, Offenlegungsbericht (Verbriefungspositionen)",
  },
  krypto_aktiv: {
    hinweis: "Das Institut hält Kryptowerte, verwahrt sie für Kunden oder bietet Dienstleistungen nach MiCA bzw. Kryptoverwahrung nach KWG an.",
    pruefen: [
      "Bietet es Kunden Handel, Verwahrung oder Transfer von Kryptowerten an, auch über einen Partner?",
      "Hält es Kryptowerte oder Stablecoins im eigenen Bestand?",
    ],
    quelle: "Erlaubnisumfang, Produktkatalog",
  },
  kleinstunternehmen: {
    hinweis: "Kleinstunternehmen nach Art. 3 Nr. 60 DORA: weniger als 10 Beschäftigte und ein Jahresumsatz oder eine Jahresbilanzsumme von höchstens 2 Mio. €. Für KWG-Institute außerhalb von Art. 2 DORA, etwa Leasing- und Factoringinstitute, entfallen dann die Drittparteienregeln der Art. 28 bis 30 DORA (§ 1a Abs. 2a KWG).",
    pruefen: [
      "Hat das Institut weniger als 10 Beschäftigte?",
      "Liegen Jahresumsatz oder Jahresbilanzsumme bei höchstens 2 Mio. €?",
      "Gehört das Institut zu einer Gruppe? Dann kommt es auf die Größe des einzelnen Instituts an, bei verbundenen Unternehmen auf die Empfehlung 2003/361/EG.",
    ],
    quelle: "Jahresabschluss, Personalabteilung",
  },
  beschaeftigte_ab_1000: {
    hinweis: "Das Lieferkettensorgfaltspflichtengesetz gilt für Unternehmen mit in der Regel mindestens 1.000 Beschäftigten in Deutschland (§ 1 LkSG). Leiharbeitnehmer zählen ab sechs Monaten Einsatzdauer mit, bei verbundenen Unternehmen werden die Beschäftigten der Konzerngesellschaften der Obergesellschaft zugerechnet.",
    pruefen: [
      "Hat das Unternehmen in der Regel mindestens 1.000 Beschäftigte im Inland?",
      "Ist es Obergesellschaft eines Konzerns? Dann zählen die inländischen Beschäftigten aller konzernangehörigen Gesellschaften mit.",
    ],
    quelle: "Personalabteilung, Lagebericht (Mitarbeiterzahl)",
  },
  auslagerung_wesentlich: {
    hinweis: "Wesentliche Auslagerungen nach § 25b KWG und MaRisk AT 9 sowie IKT-Dienstleistungen für kritische oder wichtige Funktionen nach DORA.",
    pruefen: [
      "Gibt es Auslagerungen, die in der Risikoanalyse als wesentlich eingestuft sind (z. B. Rechenzentrum, Kernbankensystem, Meldewesen, Interne Revision)?",
      "Enthält das DORA-Informationsregister Verträge für kritische oder wichtige Funktionen?",
      "Hat das Institut Auslagerungen nach § 24 Abs. 1 Nr. 19 KWG an die BaFin angezeigt?",
    ],
    quelle: "Auslagerungsregister, DORA-Informationsregister, Auslagerungsbeauftragter",
  },
  ki_systeme: {
    hinweis: "Hochrisiko-KI nach Anhang III der KI-Verordnung. Im Finanzsektor sind das vor allem Systeme zur Kreditwürdigkeitsprüfung oder zum Scoring natürlicher Personen und zur Risiko- und Preisbewertung in der Lebens- und Krankenversicherung. Betrugserkennung zählt nicht dazu.",
    pruefen: [
      "Prüft ein KI- oder Machine-Learning-Modell die Kreditwürdigkeit natürlicher Personen? Auch Einzelunternehmer und Freiberufler sind natürliche Personen.",
      "Setzt das Institut ein zugekauftes Scoring-System mit KI-Komponente ein?",
      "Nur klassische Scorecards oder regelbasierte Entscheidungen? Dann meist „Nein“.",
    ],
    quelle: "Modellinventar, Kreditprozessbeschreibung, Datenschutz- bzw. KI-Beauftragter",
  },
  wpi_gross: {
    hinweis: "Großes Wertpapierinstitut (Klasse 1): Es betreibt Eigenhandel oder Emissionsgeschäft und hat eine Bilanzsumme ab 15 Mrd. € (bzw. ab 5 Mrd. € nach Anordnung). Es wendet die CRR wie ein Kreditinstitut an.",
    pruefen: [
      "Betreibt das Institut Eigenhandel oder das Emissionsgeschäft mit Übernahme?",
      "Liegt die Bilanzsumme (bzw. die der Gruppe) bei 15 Mrd. € oder mehr?",
    ],
    quelle: "Erlaubnisumfang, Jahresabschluss",
  },
  wpi_mittel: {
    hinweis: "Mittleres Wertpapierinstitut (Klasse 2): Es ist weder groß noch erfüllt es alle Schwellen für kleine Wertpapierinstitute.",
    pruefen: ["Ist das Institut weder ein großes Wertpapierinstitut noch erfüllt es alle Bedingungen für ein kleines?"],
    quelle: "Einstufung durch die BaFin, Meldewesen nach IFR",
  },
  wpi_klein: {
    hinweis: "Kleines Wertpapierinstitut (Klasse 3) nach § 2 Abs. 16 WpIG: Es erfüllt alle Schwellen der IFR für kleine und nicht verflochtene Wertpapierfirmen.",
    pruefen: [
      "Liegen die verwalteten Vermögen (AUM) unter 1,2 Mrd. €?",
      "Hält das Institut keine Kundengelder und Kundenwertpapiere und betreibt es keinen Eigenhandel?",
      "Liegen Bilanzsumme unter 100 Mio. € und Bruttoerträge unter 30 Mio. €?",
    ],
    quelle: "IFR-Meldungen, Jahresabschluss",
  },
  geldmarktfonds: {
    hinweis: "Die KVG verwaltet Geldmarktfonds nach der Geldmarktfonds-Verordnung (EU) 2017/1131.",
    pruefen: ["Ist einer der verwalteten Fonds als Geldmarktfonds (VNAV, LVNAV oder CNAV) zugelassen?"],
    quelle: "Fondsliste, Verkaufsprospekte",
  },
  eltif: {
    hinweis: "Die KVG verwaltet europäische langfristige Investmentfonds (ELTIF), Risikokapitalfonds (EuVECA) oder Fonds für soziales Unternehmertum (EuSEF).",
    pruefen: ["Trägt einer der verwalteten Fonds die Bezeichnung ELTIF, EuVECA oder EuSEF?"],
    quelle: "Fondsliste",
  },
  versicherungsvertrieb: {
    hinweis: "Vertrieb von Versicherungsprodukten nach der Versicherungsvertriebsrichtlinie (IDD), auch als Nebentätigkeit eines Instituts.",
    pruefen: [
      "Vermittelt das Institut Restschuld-, Objekt-, Kfz- oder Lebensversicherungen an Kunden?",
      "Bietet es zu Leasing- oder Kreditverträgen eine Versicherung oder Schutzpauschale an, hinter der ein Versicherer steht?",
    ],
    quelle: "Produktkatalog, Vertriebsverträge mit Versicherern, Eintrag im Vermittlerregister",
  },
  kritis: {
    hinweis: "Betreiber kritischer Infrastruktur im Sektor Finanz- und Versicherungswesen (BSI-Kritisverordnung bzw. KRITIS-Dachgesetz), etwa bei sehr großem Zahlungsverkehrs- oder Bargeldvolumen.",
    pruefen: ["Hat das Institut sich beim BSI als Kritis-Betreiber registriert oder die Schwellenwerte der Kritisverordnung geprüft?"],
    quelle: "Informationssicherheitsbeauftragter, BSI-Registrierung",
  },
  lsi_hi: {
    hinweis: "High-Impact-LSI: ein weniger bedeutendes Institut, das die EZB wegen Größe oder Geschäftsmodell besonders eng beobachtet.",
    pruefen: ["Ist das Institut in der EZB-Liste beaufsichtigter Unternehmen als LSI mit „High Impact“ geführt oder hat die Aufsicht das mitgeteilt?"],
    quelle: "EZB-Liste beaufsichtigter Unternehmen, Schreiben der BaFin",
  },
  sitz_lu: {
    hinweis: "Die Gesellschaft hat ihren Sitz in Luxemburg und untersteht der CSSF.",
    pruefen: ["Ist die Verwaltungsgesellschaft oder der Fonds in Luxemburg zugelassen?"],
    quelle: "Handelsregister, CSSF-Register",
  },
};

export const hintFor = (id: string): Hint | undefined => HINTS[id];
