// Generiert aus dem Wireframe. Beispieldaten: Dokumente, Daten und
// Zusammenfassungen sind erfunden und keine regulatorische Auskunft.

export type Lang = "de" | "en";
export type Txt = { de: string; en: string };

export interface Provider { id: string; n: Txt; s: Txt; tags: string[] }
export interface Topic { id: string; n: Txt; d: Txt }
export interface Cond { k: string; any: string[] }
/** Fachbeitrag einer Beratungsgesellschaft (Big 4 u. a.) zu einem Update. */
export interface Advisory { f: string; ti: string; url: string; d?: string }
export interface Update {
  d: string; t: Txt; src: string; ti: Txt; s: Txt;
  refnum?: string; deadline?: string; eff?: string;
  /** Link zur Primärquelle. Gesetzt bei echten, gescrapten Updates. */
  url?: string;
  /** Big-4-Fachbeiträge, die genau diese Meldung kommentieren (Scraper). */
  adv?: Advisory[];
}
export interface Framework {
  id: string; topic: string; ents: string[]; jur: "EU" | "DE" | "EU+DE";
  n: Txt; ref: string; about: Txt; cond: Cond | null; condL?: Txt; u: Update[];
}
export interface Option { v: string; l: Txt }
export interface Question { key: string; multi: boolean; q: Txt; why: Txt; o: Option[] }

export const TODAY = new Date(2026, 7, 24);

export const PROVIDERS: Provider[] = [
  { id:"CI", n:{de:"Bank / Kreditinstitut",en:"Bank / credit institution"},
    s:{de:"Einlagen- und Kreditgeschäft nach KWG und CRR",en:"Deposit-taking and lending under KWG and CRR"},
    tags:["CRR III","MaRisk","DORA","AMLA"] },
  { id:"AM", n:{de:"Asset Manager / KVG",en:"Asset manager / fund manager"},
    s:{de:"AIF- oder OGAW-Verwaltung nach KAGB",en:"AIF or UCITS management under KAGB"},
    tags:["AIFMD II","SFDR","ELTIF 2.0","DORA"] },
  { id:"IF", n:{de:"Wertpapierinstitut",en:"Investment firm"},
    s:{de:"Wertpapierdienstleistungen nach WpIG und MiFID II",en:"Investment services under WpIG and MiFID II"},
    tags:["MiFID II","IFR/IFD","MAR","DORA"] },
  { id:"PI", n:{de:"Zahlungs- / E-Geld-Institut",en:"Payment / e-money institution"},
    s:{de:"Zahlungsdienste und E-Geld nach ZAG",en:"Payment services and e-money under ZAG"},
    tags:["PSD3/PSR","Instant Payments","MiCA","AMLA"] },
  { id:"INS", n:{de:"Versicherungsunternehmen",en:"Insurance undertaking"},
    s:{de:"Versicherungsgeschäft nach VAG und Solvency II",en:"Insurance business under VAG and Solvency II"},
    tags:["Solvency II","IDD","SFDR","DORA"] },
  { id:"OTH", n:{de:"Leasing, Factoring, Sonstige",en:"Leasing, factoring, other"},
    s:{de:"Finanzdienstleistungen mit eingeschränkter Erlaubnis",en:"Financial services under a limited licence"},
    tags:["GwG","HinSchG","NIS-2","BGB"] }
];

export const TOPICS: Topic[] = [
  { id:"ICT", n:{de:"IT & digitale Resilienz",en:"IT & digital resilience"},
    d:{de:"IKT-Risikomanagement, Vorfallmeldung, Auslagerung an IT-Dienstleister, Cybersicherheit.",
       en:"ICT risk management, incident reporting, outsourcing to IT providers, cybersecurity."} },
  { id:"AML", n:{de:"Geldwäscheprävention",en:"Financial crime & AML"},
    d:{de:"Sorgfaltspflichten, Verdachtsmeldungen, wirtschaftlich Berechtigte, Sanktionen.",
       en:"Due diligence, suspicious activity reporting, beneficial ownership, sanctions."} },
  { id:"PRU", n:{de:"Eigenmittel & Aufsichtsrecht",en:"Capital & prudential"},
    d:{de:"Eigenmittel, Liquidität, Risikomessung, Sanierung und Abwicklung.",
       en:"Own funds, liquidity, risk measurement, recovery and resolution."} },
  { id:"GOV", n:{de:"Governance & Auslagerung",en:"Governance & outsourcing"},
    d:{de:"Organisationspflichten, Auslagerungsmanagement, Hinweisgeberschutz, Vergütung.",
       en:"Organisational duties, outsourcing management, whistleblowing, remuneration."} },
  { id:"MKT", n:{de:"Wertpapiergeschäft & Anlegerschutz",en:"Markets & investor protection"},
    d:{de:"Wohlverhaltensregeln, Marktintegrität, Produktinformation, Vertrieb.",
       en:"Conduct rules, market integrity, product disclosure, distribution."} },
  { id:"PAY", n:{de:"Zahlungsverkehr",en:"Payments"},
    d:{de:"Zahlungsdienste, starke Kundenauthentifizierung, Echtzeitzahlungen, Kryptowerte.",
       en:"Payment services, strong customer authentication, instant payments, crypto-assets."} },
  { id:"FND", n:{de:"Fondsregulierung",en:"Fund regulation"},
    d:{de:"Fondsverwaltung, Liquiditätsinstrumente, Verwahrstelle, Produktregime.",
       en:"Fund management, liquidity tools, depositary, product regimes."} },
  { id:"ESG", n:{de:"Nachhaltigkeit",en:"Sustainability"},
    d:{de:"Offenlegung, Taxonomie, Berichterstattung, ESG-Risiken.",
       en:"Disclosure, taxonomy, reporting, ESG risks."} },
  { id:"REP", n:{de:"Meldewesen",en:"Supervisory reporting"},
    d:{de:"Meldetaxonomien, Einreichungsfristen, statistische Meldungen.",
       en:"Reporting taxonomies, submission deadlines, statistical returns."} },
  { id:"INSU", n:{de:"Versicherungsaufsicht",en:"Insurance supervision"},
    d:{de:"Solvenzkapital, Governance, Vertrieb, Berichterstattung.",
       en:"Solvency capital, governance, distribution, reporting."} }
];

export const FRAMEWORKS: Framework[] = [

  { id:"dora", jur:"EU",
    about:{de:"Einheitliches EU-Regelwerk für IKT-Risiken im Finanzsektor: Risikomanagement, Meldung schwerwiegender Vorfälle, Resilienztests und Überwachung kritischer IT-Dienstleister.",en:"Single EU rulebook for ICT risk in the financial sector: risk management, major incident reporting, resilience testing and oversight of critical IT providers."}, topic:"ICT", ents:["CI","AM","IF","PI","INS"],
    n:{de:"DORA: Digitale operationale Resilienz",en:"DORA: Digital Operational Resilience"},
    ref:"VO (EU) 2022/2554", cond:null,
    u:[
      {refnum:"C(2026) 4812", eff:"01.03.2027", d:"12.08.2026", t:{de:"RTS",en:"RTS"}, src:"eur-lex.europa.eu",
       ti:{de:"Delegierte Verordnung zu Weitervergabe kritischer IKT-Dienste",en:"Delegated regulation on subcontracting of critical ICT services"},
       s:{de:"Legt fest, unter welchen Bedingungen IKT-Drittdienstleister kritische Funktionen weitervergeben dürfen. Vertragliche Mindestinhalte werden auf die zweite Subunternehmerebene ausgedehnt.",
          en:"Sets out the conditions under which ICT third-party providers may subcontract critical functions. Minimum contractual content is extended to the second tier of subcontractors."}},
      {d:"04.08.2026", t:{de:"Berichtigung",en:"Corrigendum"}, src:"eur-lex.europa.eu",
       ti:{de:"Berichtigung der ITS zum Informationsregister",en:"Corrigendum to the ITS on the register of information"},
       s:{de:"Korrigiert die Feldlängen in Tabelle B_02.02 und stellt die deutsche Sprachfassung richtig. Keine inhaltliche Änderung der Meldepflicht.",
          en:"Corrects field lengths in table B_02.02 and rectifies the German language version. No substantive change to the reporting duty."}},
      {d:"22.07.2026", t:{de:"Q&A",en:"Q&A"}, src:"esas-joint-committee.europa.eu",
       ti:{de:"Neue Antworten zu bedrohungsgeleiteten Penetrationstests",en:"New answers on threat-led penetration testing"},
       s:{de:"Klärt, wann Gruppentests für mehrere Konzerngesellschaften anerkannt werden und wie externe Tester nachzuweisen sind.",
          en:"Clarifies when group-wide tests are recognised for several group entities and how external testers must be evidenced."}},
      {deadline:"30.09.2026", d:"30.06.2026", t:{de:"Konsultation",en:"Consultation"}, src:"eba.europa.eu",
       ti:{de:"Leitlinien zur Meldung schwerwiegender IKT-Vorfälle",en:"Guidelines on reporting major ICT-related incidents"},
       s:{de:"Entwurf verkürzt die Erstmeldefrist von 24 auf 4 Stunden. Stellungnahmen bis 30.09.2026.",
          en:"Draft shortens the initial notification window from 24 to 4 hours. Comments due by 30 Sep 2026."}}
    ]},

  { id:"nis2", jur:"EU+DE",
    about:{de:"Cybersicherheitsanforderungen für wesentliche und wichtige Einrichtungen, in Deutschland umgesetzt über das BSI-Gesetz.",en:"Cybersecurity requirements for essential and important entities, implemented in Germany through the BSI Act."}, topic:"ICT", ents:["CI","AM","IF","PI","INS","OTH"],
    n:{de:"NIS-2 / BSIG: Cybersicherheit",en:"NIS 2 / BSIG: cybersecurity"},
    ref:"RL (EU) 2022/2555, BSIG", cond:{k:"cross",any:["kritis"]},
    condL:{de:"nur bei Einstufung als kritische Infrastruktur",en:"only if classified as critical infrastructure"},
    u:[
      {d:"07.08.2026", t:{de:"Bundesrat",en:"Bundesrat"}, src:"dip.bundestag.de",
       ti:{de:"Stellungnahme des Bundesrates zum NIS2-Umsetzungsgesetz",en:"Bundesrat opinion on the NIS 2 implementation act"},
       s:{de:"Die Länder fordern längere Übergangsfristen für Einrichtungen unterhalb der Schwellenwerte und eine Klarstellung zum Verhältnis zu DORA.",
          en:"The states call for longer transitional periods for entities below the thresholds and clarification of the relationship with DORA."}},
      {d:"26.06.2026", t:{de:"Regierungsentwurf",en:"Government bill"}, src:"dip.bundestag.de",
       ti:{de:"Regierungsentwurf eines NIS2-Umsetzungsgesetzes",en:"Government bill for a NIS 2 implementation act"},
       s:{de:"Übernimmt den Referentenentwurf weitgehend, ergänzt aber eine ausdrückliche Bereichsausnahme für Unternehmen, die bereits vollständig unter DORA fallen.",
          en:"Largely adopts the ministerial draft but adds an express carve-out for entities already fully within DORA's scope."}},
      {d:"14.05.2026", t:{de:"Referentenentwurf",en:"Ministerial draft"}, src:"bmi.bund.de",
       ti:{de:"Referentenentwurf zur Umsetzung der NIS-2-Richtlinie",en:"Ministerial draft implementing the NIS 2 Directive"},
       s:{de:"Erste Fassung mit Registrierungspflicht binnen drei Monaten und Nachweispflicht gegenüber dem BSI alle drei Jahre.",
          en:"First version with a three-month registration duty and evidence to be filed with the BSI every three years."}}
    ]},

  { id:"ebaict", jur:"EU",
    about:{de:"Aufsichtliche Leitlinien der EBA zur Steuerung von IKT- und Sicherheitsrisiken, die MaRisk und DORA operativ unterlegen.",en:"EBA supervisory guidelines on managing ICT and security risk, giving operational substance to MaRisk and DORA."}, topic:"ICT", ents:["CI","IF","PI"],
    n:{de:"EBA-Leitlinien zu IKT- und Sicherheitsrisiken",en:"EBA guidelines on ICT and security risk"},
    ref:"EBA/GL/2025/07", cond:null,
    u:[
      {refnum:"EBA/GL/2026/11", deadline:"30.11.2026", d:"09.08.2026", t:{de:"Final Report",en:"Final report"}, src:"eba.europa.eu",
       ti:{de:"Überarbeitete Leitlinien zur Steuerung von IKT-Risiken",en:"Revised guidelines on ICT risk management"},
       s:{de:"Das Register informationsverbundener Dienstleister wird auf Subunternehmer der zweiten Ebene erweitert. Comply-or-explain bis 30.11.2026.",
          en:"The register of information-linked providers is extended to second-tier subcontractors. Comply-or-explain by 30 Nov 2026."}}
    ]},

  { id:"amla", jur:"EU",
    about:{de:"Das unmittelbar geltende EU-Geldwäscherecht samt der neuen Behörde AMLA, die technische Standards erlässt und ausgewählte Institute direkt beaufsichtigt.",en:"The directly applicable EU AML rulebook together with the new AMLA authority, which issues technical standards and directly supervises selected entities."}, topic:"AML", ents:["CI","AM","IF","PI","INS","OTH"],
    n:{de:"AMLA-Verordnung und EU-Geldwäscheverordnung",en:"AMLA Regulation and EU AML Regulation"},
    ref:"VO (EU) 2024/1620, 2024/1624", cond:{k:"cross",any:["aml"]},
    condL:{de:"nur für geldwäscherechtlich Verpflichtete",en:"only for obliged entities under AML law"},
    u:[
      {refnum:"AMLA/CP/2026/03", deadline:"12.09.2026", d:"18.08.2026", t:{de:"Konsultation",en:"Consultation"}, src:"amla.europa.eu",
       ti:{de:"Entwurf technischer Regulierungsstandards zu den Sorgfaltspflichten",en:"Draft regulatory technical standards on customer due diligence"},
       s:{de:"Der Schwellenwert für vereinfachte Sorgfaltspflichten sinkt von 15.000 auf 10.000 Euro. Bestandskundendaten sind künftig alle drei statt alle fünf Jahre zu aktualisieren. Frist 12.09.2026.",
          en:"The threshold for simplified due diligence drops from EUR 15,000 to EUR 10,000. Existing customer data must be refreshed every three years instead of five. Deadline 12 Sep 2026."}},
      {d:"30.06.2026", t:{de:"Leitlinien",en:"Guidelines"}, src:"amla.europa.eu",
       ti:{de:"Finale Leitlinien zum risikobasierten Ansatz",en:"Final guidelines on the risk-based approach"},
       s:{de:"Konkretisieren die Risikofaktoren für Korrespondenzbankbeziehungen und den Umgang mit Drittstaaten mit hohem Risiko.",
          en:"Specify risk factors for correspondent relationships and the treatment of high-risk third countries."}},
      {d:"12.06.2026", t:{de:"Q&A",en:"Q&A"}, src:"amla.europa.eu",
       ti:{de:"Klarstellungen zum Anwendungsbeginn des EU-Regelwerks",en:"Clarifications on the date of application of the EU rulebook"},
       s:{de:"Bestätigt, dass nationale Vorgaben bis zum 10.07.2027 fortgelten, soweit sie strenger sind.",
          en:"Confirms that national requirements continue to apply until 10 Jul 2027 where they are stricter."}}
    ]},

  { id:"gwg", jur:"DE",
    about:{de:"Das deutsche Geldwäschegesetz mit Sorgfalts-, Melde- und Aufzeichnungspflichten, das derzeit an das EU-Regelwerk angepasst wird.",en:"The German Money Laundering Act with due diligence, reporting and record-keeping duties, currently being aligned with the EU rulebook."}, topic:"AML", ents:["CI","AM","IF","PI","INS","OTH"],
    n:{de:"Geldwäschegesetz",en:"German Money Laundering Act"},
    ref:"GwG", cond:{k:"cross",any:["aml"]},
    condL:{de:"nur für geldwäscherechtlich Verpflichtete",en:"only for obliged entities under AML law"},
    u:[
      {d:"11.08.2026", t:{de:"Referentenentwurf",en:"Ministerial draft"}, src:"bundesfinanzministerium.de",
       ti:{de:"Referentenentwurf eines GwG-Anpassungsgesetzes",en:"Ministerial draft of a GwG adaptation act"},
       s:{de:"Passt das GwG an die EU-Geldwäscheverordnung an und streicht die Vorschriften, die künftig unmittelbar aus der Verordnung folgen.",
          en:"Aligns the GwG with the EU AML Regulation and deletes provisions that will follow directly from the regulation."}},
      {d:"24.07.2026", t:{de:"Auslegungshinweise",en:"Interpretation notice"}, src:"bafin.de",
       ti:{de:"Aktualisierte Auslegungs- und Anwendungshinweise der BaFin",en:"Updated BaFin interpretation and application notes"},
       s:{de:"Neuer Abschnitt zu Videoidentifizierung und zur Nutzung der EUDI-Wallet für die Identitätsprüfung.",
          en:"New section on video identification and use of the EUDI wallet for identity verification."}}
    ]},

  { id:"crr3", jur:"EU",
    about:{de:"Umsetzung von Basel III in der EU: Eigenmittelanforderungen, Output Floor, Kreditrisiko-Standardansatz und Marktrisiko.",en:"EU implementation of Basel III: own funds requirements, output floor, standardised credit risk approach and market risk."}, topic:"PRU", ents:["CI"],
    n:{de:"CRR III / CRD VI: Eigenmittel und Aufsicht",en:"CRR III / CRD VI: capital and supervision"},
    ref:"VO (EU) 2024/1623, RL (EU) 2024/1619", cond:null,
    u:[
      {d:"16.08.2026", t:{de:"RTS",en:"RTS"}, src:"eba.europa.eu",
       ti:{de:"Technische Standards zum alternativen Standardansatz für Marktrisiken",en:"Technical standards on the alternative standardised approach for market risk"},
       s:{de:"Präzisiert die Abgrenzung des Handelsbuchs und die Behandlung von Fremdwährungspositionen im Anlagebuch.",
          en:"Specifies the trading book boundary and the treatment of foreign exchange positions in the banking book."}},
      {d:"05.08.2026", t:{de:"Delegierte VO",en:"Delegated regulation"}, src:"eur-lex.europa.eu",
       ti:{de:"Übergangsregelungen zum Output Floor",en:"Transitional arrangements for the output floor"},
       s:{de:"Verlängert die Übergangsbehandlung für Beteiligungspositionen und grundpfandrechtlich besicherte Kredite um zwei Jahre.",
          en:"Extends the transitional treatment for equity exposures and mortgage-secured loans by two years."}},
      {deadline:"30.09.2026", d:"21.07.2026", t:{de:"Konsultation",en:"Consultation"}, src:"bafin.de",
       ti:{de:"Konsultation zur nationalen Umsetzung der CRD VI",en:"Consultation on the national implementation of CRD VI"},
       s:{de:"Betrifft insbesondere die Anzeigepflichten für Zweigstellen aus Drittstaaten. Frist 30.09.2026.",
          en:"Concerns in particular notification duties for third-country branches. Deadline 30 Sep 2026."}}
    ]},

  { id:"marisk", jur:"DE",
    about:{de:"Die aufsichtliche Auslegung des § 25a KWG durch die BaFin: Organisation, Risikosteuerung, Kreditgeschäft, Handel und Auslagerung.",en:"BaFin's supervisory interpretation of § 25a KWG: organisation, risk control, lending, trading and outsourcing."}, topic:"PRU", ents:["CI"],
    n:{de:"MaRisk: Mindestanforderungen an das Risikomanagement",en:"MaRisk: minimum requirements for risk management"},
    ref:"BaFin-Rundschreiben", cond:{k:"juris",any:["DE"]},
    condL:{de:"nur bei Sitz oder Zweigstelle in Deutschland",en:"only with a seat or branch in Germany"},
    u:[
      {refnum:"RS 05/2026 (BA)", eff:"01.01.2027", d:"14.08.2026", t:{de:"Rundschreiben",en:"Circular"}, src:"bafin.de",
       ti:{de:"Novelle der MaRisk veröffentlicht",en:"MaRisk amendment published"},
       s:{de:"AT 4.4.2 wird um Anforderungen an die Unabhängigkeit der Compliance-Funktion ergänzt. BTO 1.2.4 verlangt eine dokumentierte Neuprodukt-Prozessbewertung je Assetklasse. Anwendung ab 01.01.2027.",
          en:"AT 4.4.2 is extended with requirements on the independence of the compliance function. BTO 1.2.4 requires a documented new product process assessment per asset class. Applies from 1 Jan 2027."}},
      {d:"19.03.2026", t:{de:"Konsultation",en:"Consultation"}, src:"bafin.de",
       ti:{de:"Konsultationsfassung der MaRisk-Novelle",en:"Consultation draft of the MaRisk amendment"},
       s:{de:"Entwurf mit erstmaligen Vorgaben zum Einsatz von KI-Verfahren in der Risikomessung.",
          en:"Draft with first-time requirements on the use of AI methods in risk measurement."}}
    ]},

  { id:"brrd", jur:"EU",
    about:{de:"Sanierungs- und Abwicklungsplanung, MREL-Anforderungen und Zuständigkeit des Einheitlichen Abwicklungsausschusses.",en:"Recovery and resolution planning, MREL requirements and the remit of the Single Resolution Board."}, topic:"PRU", ents:["CI","IF"],
    n:{de:"BRRD: Sanierungs- und Abwicklungsrichtlinie",en:"BRRD: Bank Recovery and Resolution Directive"},
    ref:"BRRD (2014/59/EU), SRM-VO", cond:null,
    u:[
      {d:"08.08.2026", t:{de:"Policy",en:"Policy"}, src:"srb.europa.eu",
       ti:{de:"MREL-Policy 2026 des Einheitlichen Abwicklungsausschusses",en:"Single Resolution Board MREL policy 2026"},
       s:{de:"Passt die Kalibrierung für Institute mit Übertragungsstrategie an und konkretisiert die Nachweise zur Abwicklungsfähigkeit.",
          en:"Adjusts calibration for institutions with a transfer strategy and specifies resolvability evidencing."}}
    ]},

  { id:"ifr", jur:"EU",
    about:{de:"Eigenes Aufsichtsregime für Wertpapierinstitute mit K-Faktoren anstelle bankaufsichtlicher Eigenmittelanforderungen.",en:"A separate prudential regime for investment firms using K-factors instead of banking own funds requirements."}, topic:"PRU", ents:["IF"],
    n:{de:"IFR / IFD: Wertpapierinstitute",en:"IFR / IFD: investment firms"},
    ref:"VO (EU) 2019/2033, RL (EU) 2019/2034", cond:null,
    u:[
      {d:"29.06.2026", t:{de:"Leitlinien",en:"Guidelines"}, src:"eba.europa.eu",
       ti:{de:"Leitlinien zur Einstufung als kleines und nicht verflochtenes Wertpapierinstitut",en:"Guidelines on classification as a small and non-interconnected investment firm"},
       s:{de:"Vereinheitlicht die Berechnung der K-Faktoren beim Über- und Unterschreiten der Schwellenwerte.",
          en:"Harmonises K-factor calculation when thresholds are crossed in either direction."}}
    ]},

  { id:"outsourcing", jur:"EU+DE",
    about:{de:"Anforderungen an Auswahl, Vertragsgestaltung, Steuerung und Registrierung von Auslagerungen einschließlich Weiterverlagerung.",en:"Requirements for selecting, contracting, managing and registering outsourcing arrangements, including subcontracting."}, topic:"GOV", ents:["CI","AM","IF","PI","INS"],
    n:{de:"EBA-Leitlinien zur Auslagerung",en:"EBA Guidelines on Outsourcing"},
    ref:"EBA/GL/2019/02, AT 9 MaRisk", cond:{k:"cross",any:["outsourcing"]},
    condL:{de:"nur bei wesentlichen Auslagerungen",en:"only where material outsourcing exists"},
    u:[
      {d:"09.08.2026", t:{de:"Leitlinien",en:"Guidelines"}, src:"eba.europa.eu",
       ti:{de:"Aktualisierte Leitlinien zu Auslagerungsvereinbarungen",en:"Updated guidelines on outsourcing arrangements"},
       s:{de:"Führt das Auslagerungsregister mit dem DORA-Informationsregister zusammen. Doppelmeldungen entfallen ab 2027.",
          en:"Merges the outsourcing register with the DORA register of information. Duplicate reporting ends from 2027."}},
      {d:"12.05.2026", t:{de:"Konsultation",en:"Consultation"}, src:"eba.europa.eu",
       ti:{de:"Konsultation zur Zusammenführung der Registeranforderungen",en:"Consultation on merging the register requirements"},
       s:{de:"Entwurf mit einheitlichem Datenmodell für Auslagerungen und IKT-Drittdienstleister.",
          en:"Draft with a single data model for outsourcing and ICT third-party providers."}}
    ]},

  { id:"hinschg", jur:"EU+DE",
    about:{de:"Pflicht zu internen Meldekanälen, Schutz hinweisgebender Personen vor Repressalien und Dokumentationspflichten.",en:"Duty to operate internal reporting channels, protection of reporting persons against retaliation, and documentation duties."}, topic:"GOV", ents:["CI","AM","IF","PI","INS","OTH"],
    n:{de:"Hinweisgeberschutzgesetz",en:"Whistleblower Protection Act"},
    ref:"HinSchG, RL (EU) 2019/1937", cond:null,
    u:[
      {d:"28.07.2026", t:{de:"Rechtsprechung",en:"Case law"}, src:"bundesgerichtshof.de",
       ti:{de:"BGH zur Vertraulichkeit interner Meldekanäle",en:"Federal Court of Justice on confidentiality of internal reporting channels"},
       s:{de:"Der Bundesgerichtshof stellt klar, dass die Identität hinweisgebender Personen auch gegenüber der internen Revision zu schützen ist.",
          en:"The court clarifies that the identity of reporting persons must also be protected from internal audit."}}
    ]},

  { id:"mifid", jur:"EU",
    about:{de:"Wohlverhaltensregeln, Geeignetheits- und Angemessenheitsprüfung, Kostenausweis, Produktgovernance und Handelstransparenz.",en:"Conduct rules, suitability and appropriateness assessment, cost disclosure, product governance and trading transparency."}, topic:"MKT", ents:["CI","AM","IF"],
    n:{de:"MiFID II / MiFIR",en:"MiFID II / MiFIR"},
    ref:"RL 2014/65/EU, VO 600/2014",
    cond:{k:"act",any:["advice","portfolio","dealing"]},
    condL:{de:"nur bei Wertpapierdienstleistungen",en:"only where investment services are provided"},
    u:[
      {d:"13.08.2026", t:{de:"RTS",en:"RTS"}, src:"esma.europa.eu",
       ti:{de:"Technische Standards zum konsolidierten Datenticker für Aktien",en:"Technical standards on the consolidated tape for equities"},
       s:{de:"Legt Datenfelder, Latenzanforderungen und den Verteilungsschlüssel für Erlöse an beitragende Handelsplätze fest.",
          en:"Sets data fields, latency requirements and the revenue allocation key for contributing venues."}},
      {d:"29.07.2026", t:{de:"Q&A",en:"Q&A"}, src:"esma.europa.eu",
       ti:{de:"Aktualisierte Antworten zu Zuwendungen und Kostenausweis",en:"Updated answers on inducements and cost disclosure"},
       s:{de:"Konkretisiert den Ausweis laufender Kosten bei Portfolios mit Zielfonds.",
          en:"Specifies the disclosure of ongoing costs for portfolios holding target funds."}}
    ]},

  { id:"mar", jur:"EU",
    about:{de:"Verbot von Insidergeschäften und Marktmanipulation, Ad-hoc-Publizität, Insiderlisten und Eigengeschäfte von Führungskräften.",en:"Prohibition of insider dealing and market manipulation, disclosure of inside information, insider lists and managers' transactions."}, topic:"MKT", ents:["CI","AM","IF"],
    n:{de:"Marktmissbrauchsverordnung",en:"Market Abuse Regulation"},
    ref:"VO (EU) 596/2014", cond:{k:"act",any:["dealing","issuance","portfolio"]},
    condL:{de:"nur bei Handels-, Emissions- oder Verwaltungstätigkeit",en:"only for dealing, issuance or management activity"},
    u:[
      {refnum:"ESMA70-2026-186", eff:"01.01.2027", d:"01.08.2026", t:{de:"Leitlinien",en:"Guidelines"}, src:"esma.europa.eu",
       ti:{de:"Überarbeitete Leitlinien zu Insiderlisten",en:"Revised guidelines on insider lists"},
       s:{de:"Vereinfachtes Format für kleine und mittlere Emittenten, verpflichtend ab 01.01.2027.",
          en:"Simplified format for small and medium-sized issuers, mandatory from 1 Jan 2027."}}
    ]},

  { id:"priips", jur:"EU",
    about:{de:"Standardisiertes Basisinformationsblatt für verpackte Anlageprodukte, das Privatkunden vor Vertragsschluss auszuhändigen ist.",en:"Standardised key information document for packaged investment products, to be provided to retail clients before conclusion."}, topic:"MKT", ents:["CI","AM","IF","INS"],
    n:{de:"PRIIPs: Basisinformationsblatt",en:"PRIIPs: key information document"},
    ref:"VO (EU) 1286/2014", cond:{k:"cli",any:["retail"]},
    condL:{de:"nur im Privatkundengeschäft",en:"only in retail business"},
    u:[
      {deadline:"31.10.2026", d:"17.07.2026", t:{de:"Konsultation",en:"Consultation"}, src:"esma.europa.eu",
       ti:{de:"Konsultation zur Überarbeitung des Basisinformationsblatts",en:"Consultation on revising the key information document"},
       s:{de:"Entwurf sieht ein digitales, mehrschichtiges Format und einen neuen Nachhaltigkeitsabschnitt vor.",
          en:"Draft provides for a digital, layered format and a new sustainability section."}}
    ]},

  { id:"psd3", jur:"EU",
    about:{de:"Nachfolgeregime zur PSD2: Zulassung, starke Kundenauthentifizierung, Zugang zu Zahlungskonten und Haftung bei Betrug.",en:"Successor regime to PSD2: authorisation, strong customer authentication, access to payment accounts and fraud liability."}, topic:"PAY", ents:["CI","PI"],
    n:{de:"PSD3 / Zahlungsdiensteverordnung",en:"PSD3 / Payment Services Regulation"},
    ref:"COM(2023) 366, COM(2023) 367", cond:{k:"act",any:["payments"]},
    condL:{de:"nur bei Erbringung von Zahlungsdiensten",en:"only where payment services are provided"},
    u:[
      {d:"19.08.2026", t:{de:"Trilog",en:"Trilogue"}, src:"consilium.europa.eu",
       ti:{de:"Vorläufige Einigung im Trilog erzielt",en:"Provisional agreement reached in trilogue"},
       s:{de:"Die Haftung für autorisierte Push-Zahlungsbetrugsfälle wird ausgeweitet. Anwendungsbeginn voraussichtlich 18 Monate nach Inkrafttreten.",
          en:"Liability for authorised push payment fraud is extended. Application expected 18 months after entry into force."}},
      {d:"26.07.2026", t:{de:"RTS",en:"RTS"}, src:"eba.europa.eu",
       ti:{de:"Technische Standards zu Ausnahmen von der starken Kundenauthentifizierung",en:"Technical standards on exemptions from strong customer authentication"},
       s:{de:"Erhöht die Betragsgrenze für kontaktlose Zahlungen und führt eine Ausnahme für wiederkehrende Abonnements ein.",
          en:"Raises the contactless payment limit and introduces an exemption for recurring subscriptions."}}
    ]},

  { id:"instant", jur:"EU",
    about:{de:"Pflicht zur Erreichbarkeit für Echtzeitüberweisungen in Euro, Entgeltgleichheit und Abgleich von Empfängername und IBAN.",en:"Duty to be reachable for euro instant credit transfers, charge parity, and verification of payee name against IBAN."}, topic:"PAY", ents:["CI","PI"],
    n:{de:"Verordnung über Echtzeitüberweisungen",en:"Instant Payments Regulation"},
    ref:"VO (EU) 2024/886", cond:{k:"act",any:["payments"]},
    condL:{de:"nur bei Erbringung von Zahlungsdiensten",en:"only where payment services are provided"},
    u:[
      {d:"06.08.2026", t:{de:"Merkblatt",en:"Guidance note"}, src:"bafin.de",
       ti:{de:"BaFin-Merkblatt zur Erreichbarkeit und zum Empfängerabgleich",en:"BaFin guidance on reachability and payee verification"},
       s:{de:"Konkretisiert die Anforderungen an den Abgleich von Name und IBAN sowie an die Fehlerbehandlung bei Abweichungen.",
          en:"Specifies requirements for matching name and IBAN and for handling mismatches."}}
    ]},

  { id:"mica", jur:"EU",
    about:{de:"Zulassungs- und Verhaltensregeln für Emittenten von Kryptowerten und für Kryptowertedienstleister in der EU.",en:"Authorisation and conduct rules for issuers of crypto-assets and for crypto-asset service providers in the EU."}, topic:"PAY", ents:["CI","IF","PI"],
    n:{de:"MiCA: Märkte für Kryptowerte",en:"MiCA: markets in crypto-assets"},
    ref:"VO (EU) 2023/1114", cond:{k:"prod",any:["crypto"]},
    condL:{de:"nur bei Kryptowerten im Angebot",en:"only where crypto-assets are offered"},
    u:[
      {d:"10.08.2026", t:{de:"Leitlinien",en:"Guidelines"}, src:"esma.europa.eu",
       ti:{de:"Leitlinien zur Verwahrung und Verwaltung von Kryptowerten",en:"Guidelines on custody and administration of crypto-assets"},
       s:{de:"Verlangt getrennte Wallet-Strukturen je Kunde und tägliche Bestandsabstimmung.",
          en:"Requires segregated wallet structures per client and daily reconciliation of holdings."}}
    ]},

  { id:"aifmd2", jur:"EU",
    about:{de:"Verwaltung alternativer Investmentfonds und OGAW: Zulassung, Organisation, Auslagerung, Liquiditätsinstrumente und Verwahrstelle.",en:"Management of alternative investment funds and UCITS: authorisation, organisation, delegation, liquidity tools and depositary."}, topic:"FND", ents:["AM"],
    n:{de:"AIFMD II und OGAW-Richtlinie",en:"AIFMD II and UCITS Directive"},
    ref:"RL (EU) 2024/927", cond:null,
    u:[
      {refnum:"ESMA34-2026-77", d:"14.08.2026", t:{de:"RTS",en:"RTS"}, src:"esma.europa.eu",
       ti:{de:"Technische Standards zu Liquiditätsmanagement-Instrumenten",en:"Technical standards on liquidity management tools"},
       s:{de:"Fondsverwalter müssen künftig mindestens zwei Instrumente je Fonds vorsehen und deren Aktivierung der Aufsicht anzeigen.",
          en:"Managers must provide for at least two tools per fund and notify the supervisor when they are activated."}},
      {d:"25.07.2026", t:{de:"Q&A",en:"Q&A"}, src:"esma.europa.eu",
       ti:{de:"Antworten zur Kreditvergabe durch Fonds",en:"Answers on loan origination by funds"},
       s:{de:"Klärt die Berechnung der Konzentrationsgrenze und die Behandlung von Bestandsportfolios im Übergang.",
          en:"Clarifies the concentration limit calculation and the treatment of legacy portfolios in transition."}},
      {d:"11.06.2026", t:{de:"Referentenentwurf",en:"Ministerial draft"}, src:"bundesfinanzministerium.de",
       ti:{de:"Referentenentwurf eines Fondsmarktstärkungsgesetzes",en:"Ministerial draft of a fund market strengthening act"},
       s:{de:"Setzt AIFMD II im KAGB um und ergänzt Regelungen zur Auslagerung von Portfolioverwaltungsfunktionen.",
          en:"Implements AIFMD II in the KAGB and adds rules on delegating portfolio management functions."}}
    ]},

  { id:"eltif", jur:"EU",
    about:{de:"Produktregime für langfristige Investmentfonds, das seit der Reform auch für Privatanleger geöffnet ist.",en:"Product regime for long-term investment funds, opened up to retail investors following the reform."}, topic:"FND", ents:["AM"],
    n:{de:"ELTIF 2.0",en:"ELTIF 2.0"},
    ref:"VO (EU) 2023/606", cond:{k:"prod",any:["eltif"]},
    condL:{de:"nur bei ELTIF- oder EuVECA-Produkten",en:"only for ELTIF or EuVECA products"},
    u:[
      {d:"23.07.2026", t:{de:"RTS",en:"RTS"}, src:"eur-lex.europa.eu",
       ti:{de:"Delegierte Verordnung zu Rücknahmefristen und Liquiditätsquoten",en:"Delegated regulation on redemption windows and liquidity ratios"},
       s:{de:"Legt Mindesthaltefristen und die Berechnung der liquiden Quote für offene ELTIF fest.",
          en:"Sets minimum holding periods and the liquid asset ratio calculation for open-ended ELTIFs."}}
    ]},

  { id:"mmf", jur:"EU",
    about:{de:"Portfolio-, Bewertungs- und Liquiditätsanforderungen für Geldmarktfonds sowie Regeln zu Rücknahmen unter Stress.",en:"Portfolio, valuation and liquidity requirements for money market funds, and rules on redemptions under stress."}, topic:"FND", ents:["AM"],
    n:{de:"Geldmarktfonds-Verordnung",en:"Money Market Funds Regulation"},
    ref:"VO (EU) 2017/1131", cond:{k:"prod",any:["mmf"]},
    condL:{de:"nur bei Geldmarktfonds im Angebot",en:"only where money market funds are offered"},
    u:[
      {d:"02.07.2026", t:{de:"Bericht",en:"Report"}, src:"esma.europa.eu",
       ti:{de:"Überprüfungsbericht zur Widerstandsfähigkeit von Geldmarktfonds",en:"Review report on money market fund resilience"},
       s:{de:"Empfiehlt die Entkopplung von Liquiditätsschwellen und Rücknahmegebühren sowie höhere Mindestliquiditätsquoten.",
          en:"Recommends decoupling liquidity thresholds from redemption fees and raising minimum liquidity ratios."}}
    ]},

  { id:"sfdr", jur:"EU",
    about:{de:"Offenlegungspflichten zu Nachhaltigkeitsrisiken und nachteiligen Nachhaltigkeitsauswirkungen auf Unternehmens- und Produktebene.",en:"Disclosure duties on sustainability risks and principal adverse impacts at entity and product level."}, topic:"ESG", ents:["CI","AM","IF","INS"],
    n:{de:"SFDR: Offenlegungsverordnung",en:"SFDR: sustainability disclosure"},
    ref:"VO (EU) 2019/2088", cond:{k:"cross",any:["esg"]},
    condL:{de:"nur bei nachhaltigkeitsbezogenen Angaben",en:"only where sustainability disclosures are made"},
    u:[
      {refnum:"COM(2026) 412", d:"20.08.2026", t:{de:"Kommissionsvorschlag",en:"Commission proposal"}, src:"eur-lex.europa.eu",
       ti:{de:"Vorschlag zur Überarbeitung der SFDR mit Produktkategorien",en:"Proposal to revise SFDR introducing product categories"},
       s:{de:"Ersetzt die Einstufung nach Artikel 8 und 9 durch drei Produktkategorien mit Mindestkriterien. Anwendung frühestens 2028.",
          en:"Replaces the Article 8 and 9 classification with three product categories subject to minimum criteria. Application in 2028 at the earliest."}},
      {d:"15.07.2026", t:{de:"Final Report",en:"Final report"}, src:"esas-joint-committee.europa.eu",
       ti:{de:"Überarbeitete technische Regulierungsstandards zur Offenlegung",en:"Revised regulatory technical standards on disclosure"},
       s:{de:"Strafft die Vorlagen für vorvertragliche und periodische Informationen und streicht sechs Indikatoren.",
          en:"Streamlines the pre-contractual and periodic templates and removes six indicators."}}
    ]},

  { id:"itsrep", jur:"EU",
    about:{de:"Einheitliche Meldebögen und Taxonomien für COREP, FINREP und weitere aufsichtliche Meldungen.",en:"Harmonised templates and taxonomies for COREP, FINREP and other supervisory returns."}, topic:"REP", ents:["CI","IF"],
    n:{de:"ITS zum aufsichtlichen Meldewesen",en:"ITS on Supervisory Reporting"},
    ref:"ITS on Supervisory Reporting", cond:{k:"cross",any:["reporting"]},
    condL:{de:"nur bei aufsichtlicher Meldepflicht",en:"only where supervisory reporting applies"},
    u:[
      {refnum:"EBA/ITS/2026/04", eff:"31.03.2027", d:"17.08.2026", t:{de:"Taxonomie",en:"Taxonomy"}, src:"eba.europa.eu",
       ti:{de:"Meldetaxonomie 4.1 veröffentlicht",en:"Reporting framework 4.1 published"},
       s:{de:"Enthält die neuen Marktrisiko-Meldebögen und Anpassungen an COREP infolge der CRR III. Erstmeldung zum Stichtag 31.03.2027.",
          en:"Contains the new market risk templates and COREP changes following CRR III. First reference date 31 Mar 2027."}},
      {d:"03.08.2026", t:{de:"Erratum",en:"Erratum"}, src:"eba.europa.eu",
       ti:{de:"Korrektur der Validierungsregeln v4.0",en:"Correction to validation rules v4.0"},
       s:{de:"Deaktiviert 14 fehlerhafte Validierungsregeln rückwirkend zum Meldestichtag 30.06.2026.",
          en:"Deactivates 14 faulty validation rules retroactively to the 30 Jun 2026 reference date."}}
    ]},

  { id:"anacredit", jur:"EU+DE",
    about:{de:"Granulare Kreditdatenmeldung an Bundesbank und ESZB auf Ebene einzelner Kredite und Kreditnehmer.",en:"Granular credit data reporting to the Bundesbank and the ESCB at individual loan and borrower level."}, topic:"REP", ents:["CI"],
    n:{de:"AnaCredit und statistische Meldungen",en:"AnaCredit and statistical reporting"},
    ref:"VO (EU) 2016/867", cond:{k:"cross",any:["reporting"]},
    condL:{de:"nur bei aufsichtlicher Meldepflicht",en:"only where supervisory reporting applies"},
    u:[
      {d:"23.07.2026", t:{de:"Rundschreiben",en:"Circular"}, src:"bundesbank.de",
       ti:{de:"Bundesbank-Rundschreiben zur Erweiterung des Kreditdatenmeldewesens",en:"Bundesbank circular on extending credit data reporting"},
       s:{de:"Nimmt Kredite an Einzelunternehmen unterhalb der bisherigen Meldegrenze auf. Anwendung ab dem Meldemonat Januar 2027.",
          en:"Adds loans to sole proprietors below the previous threshold. Applies from the January 2027 reporting month."}}
    ]},

  { id:"solvency", jur:"EU",
    about:{de:"Risikobasiertes Aufsichtsregime für Versicherer: Solvenzkapital, Governance, ORSA und Berichterstattung.",en:"Risk-based prudential regime for insurers: solvency capital, governance, ORSA and reporting."}, topic:"INSU", ents:["INS"],
    n:{de:"Solvency II",en:"Solvency II"},
    ref:"RL 2009/138/EG, DelVO 2015/35", cond:null,
    u:[
      {eff:"30.01.2027", d:"12.08.2026", t:{de:"Delegierte VO",en:"Delegated regulation"}, src:"eur-lex.europa.eu",
       ti:{de:"Anpassung der Standardformel an das Solvency-II-Review",en:"Adjustment of the standard formula following the Solvency II review"},
       s:{de:"Ändert die Zinsstrukturkurve und die Behandlung langfristiger Aktieninvestitionen. Anwendung ab 30.01.2027.",
          en:"Amends the interest rate term structure and the treatment of long-term equity investments. Applies from 30 Jan 2027."}},
      {d:"18.06.2026", t:{de:"Leitlinien",en:"Guidelines"}, src:"eiopa.europa.eu",
       ti:{de:"Leitlinien zur Berücksichtigung von Nachhaltigkeitsrisiken",en:"Guidelines on integrating sustainability risks"},
       s:{de:"Verlangt die Einbeziehung von Klimaszenarien in die unternehmenseigene Risiko- und Solvabilitätsbeurteilung.",
          en:"Requires climate scenarios to be included in the own risk and solvency assessment."}}
    ]},

  { id:"idd", jur:"EU",
    about:{de:"Anforderungen an Beratung, Vertrieb und Produktfreigabe von Versicherungsprodukten einschließlich Wohlverhaltensregeln.",en:"Requirements for advice, distribution and product approval of insurance products, including conduct rules."}, topic:"INSU", ents:["INS"],
    n:{de:"Versicherungsvertriebsrichtlinie",en:"Insurance Distribution Directive"},
    ref:"RL (EU) 2016/97", cond:{k:"cli",any:["retail"]},
    condL:{de:"nur im Privatkundengeschäft",en:"only in retail business"},
    u:[
      {d:"31.07.2026", t:{de:"Konsultation",en:"Consultation"}, src:"eiopa.europa.eu",
       ti:{de:"Konsultation zur Kleinanlegerstrategie und zum Provisionsverbot",en:"Consultation on the retail investment strategy and inducement ban"},
       s:{de:"Entwurf sieht ein Provisionsverbot im beratungsfreien Geschäft und einen einheitlichen Preis-Leistungs-Test vor.",
          en:"Draft provides for an inducement ban in execution-only business and a common value-for-money test."}}
    ]}
];

/** Zwei kurze Absätze je Rahmenwerk für die aufklappbare Sektion auf der Detailseite. */
export const ABOUT_LONG: Record<string, [Txt, Txt]> = {
  dora: [
    {de:"DORA verpflichtet Finanzunternehmen, IKT-Risiken als eigenständige Risikokategorie zu steuern: von der Governance über das Management des gesamten IKT-Lebenszyklus bis zur Klassifizierung und Meldung schwerwiegender Vorfälle innerhalb fester Fristen. Die Verordnung gilt unmittelbar und ersetzt einen Flickenteppich nationaler Vorgaben.",
     en:"DORA obliges financial entities to manage ICT risk as a risk category in its own right: from governance through the full ICT lifecycle to classifying and reporting major incidents within fixed deadlines. The regulation applies directly and replaces a patchwork of national requirements."},
    {de:"Neu ist die EU-weite Überwachung kritischer IKT-Drittdienstleister wie Cloud-Anbieter durch die europäischen Aufsichtsbehörden sowie die Pflicht zu bedrohungsgeleiteten Penetrationstests (TLPT) für bedeutende Institute. Verträge mit IT-Dienstleistern müssen Mindestinhalte erfüllen und in einem Informationsregister geführt werden.",
     en:"New is the EU-wide oversight of critical ICT third-party providers such as cloud providers by the European supervisory authorities, plus mandatory threat-led penetration testing (TLPT) for significant institutions. Contracts with IT providers must meet minimum content requirements and be kept in a register of information."}],
  nis2: [
    {de:"NIS2 weitet die europäischen Cybersicherheitspflichten auf deutlich mehr Sektoren und Unternehmen aus und unterscheidet zwischen wesentlichen und wichtigen Einrichtungen. Verlangt werden Risikomanagementmaßnahmen nach dem Stand der Technik, Lieferkettensicherheit und eine gestufte Meldung erheblicher Sicherheitsvorfälle.",
     en:"NIS2 extends European cybersecurity duties to far more sectors and companies, distinguishing between essential and important entities. It requires state-of-the-art risk management measures, supply chain security and staged reporting of significant incidents."},
    {de:"In Deutschland erfolgt die Umsetzung über das NIS2-Umsetzungsgesetz im BSI-Gesetz; die Geschäftsleitung haftet persönlich für die Billigung und Überwachung der Maßnahmen. Für Finanzunternehmen gilt der Grundsatz, dass DORA als spezielleres Regime vorgeht.",
     en:"In Germany, implementation happens through the NIS2 Implementation Act within the BSI Act; management is personally liable for approving and overseeing the measures. For financial entities, DORA takes precedence as the more specific regime."}],
  ebaict: [
    {de:"Die EBA-Leitlinien konkretisieren, wie Institute IKT- und Sicherheitsrisiken identifizieren, bewerten und mindern sollen: Informationssicherheits-Leitlinie, Rollentrennung, Zugriffsmanagement, Schwachstellen- und Patch-Prozesse sowie Sensibilisierung der Mitarbeitenden.",
     en:"The EBA guidelines specify how institutions should identify, assess and mitigate ICT and security risks: an information security policy, segregation of duties, access management, vulnerability and patch processes, and staff awareness."},
    {de:"Sie bilden die Brücke zwischen den allgemeinen Organisationspflichten aus MaRisk und den detaillierten DORA-Anforderungen und werden von BaFin und EZB in der laufenden Aufsicht als Prüfungsmaßstab herangezogen.",
     en:"They bridge the general organisational duties under MaRisk and the detailed DORA requirements, and are used by BaFin and the ECB as a benchmark in ongoing supervision."}],
  amla: [
    {de:"Das neue EU-Geldwäschepaket verlagert die zentralen Sorgfalts-, Melde- und Transparenzpflichten in eine unmittelbar geltende Verordnung und harmonisiert damit erstmals das materielle Geldwäscherecht in der gesamten Union. Nationale Spielräume werden deutlich reduziert.",
     en:"The new EU AML package moves the core due diligence, reporting and transparency duties into a directly applicable regulation, harmonising substantive AML law across the Union for the first time. National discretion is significantly reduced."},
    {de:"Die neue Behörde AMLA mit Sitz in Frankfurt erlässt technische Standards, koordiniert die nationalen Aufseher und beaufsichtigt ab 2028 ausgewählte, besonders risikoreiche Verpflichtete direkt. Institute sollten ihre Kundenannahme- und Monitoring-Prozesse frühzeitig auf das neue Regelwerk ausrichten.",
     en:"The new AMLA authority, seated in Frankfurt, issues technical standards, coordinates national supervisors and, from 2028, directly supervises selected high-risk obliged entities. Institutions should align their onboarding and monitoring processes with the new rulebook early."}],
  gwg: [
    {de:"Das Geldwäschegesetz verpflichtet Institute zu einem risikobasierten Ansatz: Risikoanalyse, interne Sicherungsmaßnahmen, Bestellung eines Geldwäschebeauftragten sowie allgemeine und verstärkte Sorgfaltspflichten gegenüber Kunden und wirtschaftlich Berechtigten.",
     en:"The Money Laundering Act requires a risk-based approach: a risk analysis, internal safeguards, appointment of an AML officer, and standard and enhanced due diligence towards customers and beneficial owners."},
    {de:"Verdachtsfälle sind unverzüglich elektronisch an die FIU zu melden; daneben bestehen Aufzeichnungs- und Aufbewahrungspflichten sowie die Pflicht zur Meldung an das Transparenzregister. Mit Geltung der EU-Geldwäscheverordnung wird das GwG auf ergänzende nationale Regelungen zurückgeschnitten.",
     en:"Suspicious activity must be reported electronically to the FIU without delay; record-keeping and retention duties and transparency register filings apply alongside. Once the EU AML Regulation applies, the GwG will be cut back to supplementary national rules."}],
  crr3: [
    {de:"CRR III setzt die finalen Basel-III-Standards in der EU um. Kernstück ist der Output Floor: Interne Modelle dürfen die Eigenmittelanforderungen langfristig nur noch auf 72,5 % des Standardansatzes senken, mit Übergangsregelungen bis 2030.",
     en:"CRR III implements the final Basel III standards in the EU. Its centrepiece is the output floor: internal models may ultimately reduce own funds requirements to no less than 72.5% of the standardised approach, with transitional arrangements until 2030."},
    {de:"Daneben werden Kreditrisiko-Standardansatz und IRB-Ansatz granularer, das operationelle Risiko erhält einen einheitlichen Standardansatz und das Marktrisiko wird über FRTB neu geregelt. Institute müssen Datenhaushalt und Meldewesen entsprechend umbauen.",
     en:"In addition, the standardised and IRB approaches for credit risk become more granular, operational risk moves to a single standardised approach and market risk is overhauled via FRTB. Institutions must rebuild their data and reporting accordingly."}],
  marisk: [
    {de:"Die MaRisk übersetzen die allgemeinen Organisationspflichten des § 25a KWG in konkrete Anforderungen: Strategie- und Risikotragfähigkeitsprozesse, Funktionstrennung, Interne Revision sowie besondere Anforderungen an Kredit- und Handelsgeschäft.",
     en:"MaRisk translates the general organisational duties of § 25a KWG into concrete requirements: strategy and risk-bearing capacity processes, segregation of functions, internal audit, and specific requirements for lending and trading."},
    {de:"Als Verwaltungsanweisung mit Öffnungsklauseln folgen sie dem Proportionalitätsprinzip und werden regelmäßig novelliert, zuletzt etwa um ESG-Risiken, Immobiliengeschäfte und die EBA-Leitlinien zur Kreditvergabe. Für Prüfungen der Bankenaufsicht sind sie der zentrale Maßstab.",
     en:"As administrative guidance with opening clauses, it follows the proportionality principle and is amended regularly — most recently to cover ESG risks, real estate business and the EBA loan origination guidelines. It is the central benchmark for supervisory examinations."}],
  brrd: [
    {de:"Das Sanierungs- und Abwicklungsregime verpflichtet Institute zu Sanierungsplänen und die Abwicklungsbehörden zu Abwicklungsplänen, damit ein Ausfall ohne Steuergelder bewältigt werden kann. Kernelement ist das Bail-in-Instrument, das Verluste zunächst Eigentümern und Gläubigern zuweist.",
     en:"The recovery and resolution regime requires institutions to draw up recovery plans and resolution authorities to prepare resolution plans, so a failure can be managed without taxpayer money. The core element is the bail-in tool, which allocates losses first to owners and creditors."},
    {de:"Über MREL müssen Institute jederzeit ausreichend berücksichtigungsfähige Verbindlichkeiten vorhalten. Für bedeutende Institute der Bankenunion liegt die Zuständigkeit beim Einheitlichen Abwicklungsausschuss (SRB), national bei der BaFin als Abwicklungsbehörde.",
     en:"Through MREL, institutions must maintain sufficient eligible liabilities at all times. For significant banking union institutions, responsibility lies with the Single Resolution Board (SRB); nationally, BaFin acts as resolution authority."}],
  ifr: [
    {de:"Das IFR/IFD-Regime löst Wertpapierinstitute aus der Bankenregulierung heraus und bemisst die Eigenmittelanforderungen über K-Faktoren, die kunden-, markt- und firmenbezogene Risiken der tatsächlichen Geschäftstätigkeit abbilden.",
     en:"The IFR/IFD regime carves investment firms out of banking regulation and sizes own funds requirements via K-factors that capture risk-to-client, risk-to-market and risk-to-firm from the actual business."},
    {de:"Kleine und nicht verflochtene Institute profitieren von Erleichterungen bei Offenlegung, Vergütung und Meldewesen, während sehr große Häuser mit bankähnlichem Geschäft wieder unter die CRR fallen. In Deutschland ist das Regime im WpIG umgesetzt.",
     en:"Small and non-interconnected firms benefit from relief on disclosure, remuneration and reporting, while very large firms with bank-like business fall back under the CRR. In Germany the regime is implemented in the WpIG."}],
  outsourcing: [
    {de:"Auslagerungen entbinden nicht von der Verantwortung: Institute müssen Risiken vor Vertragsschluss bewerten, Weisungs-, Auskunfts- und Prüfungsrechte vereinbaren und ausgelagerte Prozesse laufend überwachen — bei wesentlichen Auslagerungen mit erhöhten Anforderungen.",
     en:"Outsourcing does not transfer responsibility: institutions must assess risks before contracting, secure instruction, information and audit rights, and continuously monitor outsourced processes — with heightened requirements for critical arrangements."},
    {de:"Sämtliche Auslagerungen sind in einem Register zu dokumentieren; wesentliche Auslagerungen und deren Weiterverlagerungen sind der Aufsicht anzuzeigen. Mit DORA treten für IKT-Dienstleistungen zusätzliche vertragliche Mindestinhalte und das Informationsregister hinzu.",
     en:"All arrangements must be documented in a register; critical outsourcing and its subcontracting must be notified to the supervisor. With DORA, ICT services additionally require minimum contractual content and the register of information."}],
  hinschg: [
    {de:"Das Hinweisgeberschutzgesetz verpflichtet Beschäftigungsgeber ab 50 Mitarbeitenden — Finanzdienstleister unabhängig von der Größe — zu internen Meldestellen, über die Verstöße vertraulich, auf Wunsch auch anonym, gemeldet werden können.",
     en:"The Whistleblower Protection Act obliges employers with 50 or more staff — financial firms regardless of size — to operate internal reporting channels through which breaches can be reported confidentially, and on request anonymously."},
    {de:"Hinweisgebende Personen sind vor Repressalien wie Kündigung oder Benachteiligung geschützt; bei Verstößen greift eine Beweislastumkehr zugunsten der meldenden Person. Eingänge sind fristgebunden zu bestätigen und zu bearbeiten sowie datenschutzkonform zu dokumentieren.",
     en:"Reporting persons are protected against retaliation such as dismissal or disadvantage; in disputes, the burden of proof shifts in their favour. Reports must be acknowledged and processed within set deadlines and documented in line with data protection law."}],
  mifid: [
    {de:"MiFID II regelt das Wertpapiergeschäft entlang der gesamten Kundenbeziehung: Zielmarktbestimmung in der Produktgovernance, Geeignetheits- und Angemessenheitsprüfung, Offenlegung sämtlicher Kosten und Zuwendungen sowie Aufzeichnungspflichten inklusive Taping.",
     en:"MiFID II governs investment business across the entire client relationship: target market definition in product governance, suitability and appropriateness assessment, disclosure of all costs and inducements, and record-keeping including taping."},
    {de:"Auf Marktseite kommen Handelstransparenz, Best Execution und Transaktionsmeldungen hinzu. Mit der EU-Kleinanlegerstrategie stehen derzeit Zuwendungsregeln, Value-for-Money-Vorgaben und digitale Informationsformate im Zentrum der Reformdebatte.",
     en:"On the market side, trading transparency, best execution and transaction reporting apply. Under the EU retail investment strategy, inducement rules, value-for-money requirements and digital disclosure formats are currently at the heart of reform."}],
  mar: [
    {de:"Die Marktmissbrauchsverordnung verbietet Insidergeschäfte, deren Empfehlung sowie Marktmanipulation und verpflichtet Emittenten zur unverzüglichen Ad-hoc-Veröffentlichung von Insiderinformationen, sofern kein Aufschubgrund vorliegt.",
     en:"The Market Abuse Regulation prohibits insider dealing, recommending it, and market manipulation, and obliges issuers to disclose inside information without delay unless a deferral ground applies."},
    {de:"Flankierend gelten Pflichten zu Insiderlisten, Eigengeschäften von Führungskräften (Managers' Transactions) und Handelsverbotszeiträumen. Wertpapierdienstleister müssen verdächtige Aufträge und Geschäfte über STOR-Meldungen an die Aufsicht melden.",
     en:"This is flanked by duties around insider lists, managers' transactions and closed periods. Investment firms must report suspicious orders and transactions to the supervisor via STORs."}],
  priips: [
    {de:"Die PRIIPs-Verordnung verlangt für verpackte Anlageprodukte und Versicherungsanlageprodukte ein maximal dreiseitiges Basisinformationsblatt (KID) mit standardisierten Angaben zu Risiko, Performance-Szenarien und Kosten.",
     en:"The PRIIPs Regulation requires a key information document (KID) of no more than three pages for packaged retail and insurance-based investment products, with standardised information on risk, performance scenarios and costs."},
    {de:"Das KID muss Privatkunden rechtzeitig vor Vertragsschluss zur Verfügung stehen und laufend aktualisiert werden. Die Methodik der Szenarien und Kostendarstellung ist in technischen Standards detailliert geregelt und Gegenstand fortlaufender Überarbeitung.",
     en:"The KID must be provided to retail investors in good time before conclusion and kept up to date. The methodology for scenarios and cost disclosure is set out in detailed technical standards and subject to ongoing revision."}],
  psd3: [
    {de:"Das PSD3-Paket führt Zahlungsdienste- und E-Geld-Aufsicht in einem Regime zusammen: Die Richtlinie regelt Zulassung und laufende Aufsicht der Institute, während die neue Zahlungsdiensteverordnung (PSR) die Pflichten im Kundenverhältnis unmittelbar und EU-weit einheitlich festlegt.",
     en:"The PSD3 package merges payment services and e-money supervision into one regime: the directive covers authorisation and ongoing supervision, while the new Payment Services Regulation (PSR) sets the customer-facing rules directly and uniformly across the EU."},
    {de:"Inhaltlich werden starke Kundenauthentifizierung und Betrugshaftung verschärft — etwa bei Spoofing zulasten der Banken —, der Kontozugang für Drittdienste technisch neu geordnet und Bargeldversorgung sowie Entgelttransparenz gestärkt. Institute mit bestehender PSD2-Zulassung müssen mit Übergangsfristen neu zugelassen werden.",
     en:"Substantively, strong customer authentication and fraud liability are tightened — including bank liability for spoofing —, third-party access to accounts is technically reorganised, and cash access and fee transparency are strengthened. Institutions holding PSD2 licences must be re-authorised within transition periods."}],
  instant: [
    {de:"Die Verordnung verpflichtet Zahlungsdienstleister im Euroraum, Echtzeitüberweisungen rund um die Uhr zu empfangen und zu senden, und deckelt die Entgelte auf das Niveau herkömmlicher Überweisungen.",
     en:"The regulation obliges payment service providers in the euro area to receive and send instant credit transfers around the clock, and caps charges at the level of ordinary credit transfers."},
    {de:"Vor Ausführung müssen Dienstleister den Empfängernamen mit der IBAN abgleichen (Verification of Payee) und Abweichungen anzeigen; zudem ist die Sanktionslistenprüfung auf ein tägliches Screening der eigenen Kunden umgestellt. Die Pflichten greifen gestaffelt, für Zahlungsinstitute später als für Banken.",
     en:"Before execution, providers must verify the payee name against the IBAN and flag mismatches; sanctions screening shifts to daily screening of their own customers. The duties phase in over time, later for payment institutions than for banks."}],
  mica: [
    {de:"MiCAR schafft erstmals ein einheitliches EU-Regime für Kryptowerte außerhalb der bestehenden Finanzmarktregulierung: Emittenten von E-Geld-Token und vermögenswertereferenzierten Token benötigen eine Zulassung samt Whitepaper-, Eigenmittel- und Reservepflichten.",
     en:"MiCAR creates the first uniform EU regime for crypto-assets outside existing financial regulation: issuers of e-money tokens and asset-referenced tokens need authorisation, with whitepaper, own funds and reserve requirements."},
    {de:"Kryptowertedienstleister (CASPs) — vom Verwahrer bis zur Handelsplattform — unterliegen Zulassung, Organisations- und Wohlverhaltenspflichten sowie Regeln gegen Marktmissbrauch in Kryptowerten. Bestehende nationale Regime wie das deutsche Kryptoverwahrgeschäft gehen im EU-Regime auf.",
     en:"Crypto-asset service providers (CASPs) — from custodians to trading platforms — are subject to authorisation, organisational and conduct duties, plus market abuse rules for crypto-assets. Existing national regimes such as Germany's crypto custody licence are absorbed into the EU framework."}],
  aifmd2: [
    {de:"Die AIFMD-Novelle verschärft die Regeln für Fondsverwalter: Delegationsstrukturen müssen substanzhaltig bleiben und werden aufsichtlich gemeldet, kreditvergebende Fonds erhalten erstmals einen harmonisierten Rahmen mit Risikodiversifizierungs- und Rückbehaltspflichten.",
     en:"The AIFMD review tightens the rules for fund managers: delegation structures must retain substance and are reported to supervisors, and loan-originating funds get a harmonised framework with risk diversification and retention requirements for the first time."},
    {de:"Offene Fonds müssen künftig mindestens zwei Liquiditätsmanagement-Instrumente aus einem harmonisierten Katalog vorsehen. Die Änderungen gelten parallel für OGAW-Verwaltungsgesellschaften und sind bis 2026 in nationales Recht umzusetzen.",
     en:"Open-ended funds must in future provide for at least two liquidity management tools from a harmonised catalogue. The changes apply in parallel to UCITS management companies and must be transposed into national law by 2026."}],
  eltif: [
    {de:"Der ELTIF ist das EU-Produktvehikel für langfristige Anlagen in Infrastruktur, Sachwerte und nicht börsennotierte Unternehmen. Die Reform (ELTIF 2.0) hat Anlagegrenzen gelockert, Dachfonds- und Master-Feeder-Strukturen geöffnet und den Vertrieb an Privatanleger erheblich vereinfacht.",
     en:"The ELTIF is the EU product vehicle for long-term investment in infrastructure, real assets and unlisted companies. The reform (ELTIF 2.0) relaxed investment limits, opened fund-of-funds and master-feeder structures and considerably simplified retail distribution."},
    {de:"Für Privatanleger entfallen Mindestanlagesummen und Vermögensschwellen; stattdessen greift die MiFID-Geeignetheitsprüfung. Technische Standards regeln Rücknahmemöglichkeiten und Liquiditätsvorgaben für offene ELTIF-Strukturen.",
     en:"Minimum investment amounts and wealth thresholds for retail investors were abolished in favour of the MiFID suitability test. Technical standards govern redemption options and liquidity requirements for open-ended ELTIF structures."}],
  mmf: [
    {de:"Die Geldmarktfonds-Verordnung regelt Zulassung, zulässige Vermögenswerte, Portfoliozusammensetzung und Bewertung von Geldmarktfonds und unterscheidet zwischen Fonds mit konstantem, schwankungsarmem und variablem Nettoinventarwert.",
     en:"The Money Market Funds Regulation governs authorisation, eligible assets, portfolio composition and valuation of MMFs, distinguishing between constant, low-volatility and variable NAV funds."},
    {de:"Tägliche und wöchentliche Liquiditätsquoten, Stresstests und Know-your-Customer-Pflichten sollen Anteilsrückgaben auch in Stressphasen sicherstellen. Auf EU-Ebene wird eine Reform diskutiert, die Liquiditätspuffer erhöhen und die Kopplung von Schwellenwerten an Rücknahmesperren lösen soll.",
     en:"Daily and weekly liquidity ratios, stress testing and know-your-customer duties are designed to keep funds redeemable even in stress. An EU reform is under discussion to raise liquidity buffers and decouple thresholds from redemption gates."}],
  sfdr: [
    {de:"Die Offenlegungsverordnung verpflichtet Finanzmarktteilnehmer und Berater, Nachhaltigkeitsinformationen auf Unternehmens- und Produktebene offenzulegen: den Umgang mit Nachhaltigkeitsrisiken, nachteilige Auswirkungen (PAI) sowie vorvertragliche und periodische Produktangaben.",
     en:"The disclosure regulation obliges financial market participants and advisers to disclose sustainability information at entity and product level: the handling of sustainability risks, principal adverse impacts (PAI), and pre-contractual and periodic product disclosures."},
    {de:"Die Einstufung von Produkten nach Artikel 8 und 9 hat sich faktisch zu einem Labelsystem entwickelt, was die EU-Kommission mit der laufenden SFDR-Überarbeitung durch echte Produktkategorien ersetzen will. Die technischen Standards mit den Meldebögen werden parallel überarbeitet.",
     en:"The Article 8 and 9 classification has de facto evolved into a labelling system, which the European Commission intends to replace with genuine product categories in the ongoing SFDR review. The technical standards containing the templates are being revised in parallel."}],
  itsrep: [
    {de:"Die ITS on Supervisory Reporting legen EU-weit einheitlich fest, welche Daten Institute in welchen Formaten und Intervallen an die Aufsicht melden: COREP für Eigenmittel und Liquidität, FINREP für Finanzinformationen sowie Meldungen zu Großkrediten, Leverage Ratio und Verschuldung.",
     en:"The ITS on supervisory reporting define uniformly across the EU which data institutions report to supervisors, in which formats and at which intervals: COREP for own funds and liquidity, FINREP for financial information, plus large exposures, leverage ratio and funding reports."},
    {de:"Mit CRR III werden die Meldebögen umfassend angepasst, etwa für den Output Floor und die neuen Risikoansätze. Die EBA treibt parallel die Integration des Meldewesens voran, um Doppelmeldungen zu reduzieren und Definitionen über Aufsichts- und Statistikmeldungen hinweg zu vereinheitlichen.",
     en:"With CRR III the templates are being comprehensively revised, for instance for the output floor and the new risk approaches. In parallel, the EBA is advancing integrated reporting to reduce duplicate submissions and align definitions across supervisory and statistical reporting."}],
  anacredit: [
    {de:"AnaCredit ist das granulare Kreditmelderegister des Eurosystems: Banken melden kreditnehmerbezogene Einzeldaten zu Krediten an juristische Personen ab 25.000 Euro, in Deutschland über die Bundesbank.",
     en:"AnaCredit is the Eurosystem's granular credit register: banks report borrower-level data on loans to legal entities from €25,000, in Germany via the Bundesbank."},
    {de:"Die Daten speisen Geldpolitik, Finanzstabilitätsanalyse und Bankenaufsicht. Meldepflichtige müssen auf konsistente Stammdaten und die Verknüpfung über LEI-Kennungen achten; Erweiterungen des Merkmalskatalogs und Qualitätsanforderungen werden laufend fortgeschrieben.",
     en:"The data feeds monetary policy, financial stability analysis and banking supervision. Reporting agents must ensure consistent master data and linkage via LEI identifiers; extensions to the attribute catalogue and quality requirements are updated continuously."}],
  solvency: [
    {de:"Solvency II ist das risikobasierte Aufsichtsregime für Versicherer mit drei Säulen: quantitative Kapitalanforderungen (SCR/MCR) auf Basis einer marktnahen Bewertung, qualitative Governance-Anforderungen samt ORSA sowie umfangreiche Berichts- und Offenlegungspflichten.",
     en:"Solvency II is the risk-based supervisory regime for insurers with three pillars: quantitative capital requirements (SCR/MCR) based on market-consistent valuation, qualitative governance requirements including ORSA, and extensive reporting and disclosure duties."},
    {de:"Die laufende Überprüfung passt unter anderem Zinsextrapolation, Volatilitätsanpassung und Proportionalitätsregeln an und führt neue Vorgaben zu Nachhaltigkeitsrisiken und makroprudenzieller Aufsicht ein. Parallel entsteht mit der IRRD ein eigenes Sanierungs- und Abwicklungsregime für Versicherer.",
     en:"The ongoing review adjusts interest rate extrapolation, the volatility adjustment and proportionality rules, and introduces new requirements on sustainability risk and macroprudential supervision. In parallel, the IRRD creates a dedicated recovery and resolution regime for insurers."}],
  idd: [
    {de:"Die IDD harmonisiert den Versicherungsvertrieb in der EU: Vermittler und Versicherer müssen ehrlich, redlich und im bestmöglichen Kundeninteresse handeln, Wünsche und Bedürfnisse prüfen und vor Abschluss ein Produktinformationsblatt aushändigen.",
     en:"The IDD harmonises insurance distribution in the EU: intermediaries and insurers must act honestly, fairly and in the customer's best interest, assess demands and needs, and provide a product information document before conclusion."},
    {de:"Für Versicherungsanlageprodukte gelten zusätzlich MiFID-ähnliche Regeln zu Interessenkonflikten, Zuwendungen und Geeignetheit; die Produktfreigabe verlangt einen definierten Zielmarkt. Die EU-Kleinanlegerstrategie stellt Provisionsregeln und Preis-Leistungs-Vorgaben derzeit auf den Prüfstand.",
     en:"For insurance-based investment products, MiFID-style rules on conflicts of interest, inducements and suitability apply in addition; product approval requires a defined target market. The EU retail investment strategy is currently re-examining commission rules and value-for-money requirements."}],
};

export const QUESTIONS: Question[] = [
  { key:"size", multi:false,
    q:{de:"Wie werden Sie beaufsichtigt?",en:"How are you supervised?"},
    why:{de:"Steuert, ob SSM-Rechtsakte der EZB und Proportionalitätserleichterungen für kleine Institute angezeigt werden.",
         en:"Controls whether ECB SSM legal acts and proportionality relief for small institutions are shown."},
    o:[{v:"SI",l:{de:"Direkt durch die EZB",en:"Directly by the ECB"}},
       {v:"LSI",l:{de:"Durch BaFin und Bundesbank",en:"By BaFin and the Bundesbank"}},
       {v:"SNCI",l:{de:"Klein und nicht komplex",en:"Small and non-complex"}},
       {v:"NONE",l:{de:"Nicht prudenziell beaufsichtigt",en:"Not prudentially supervised"}}] },

  { key:"juris", multi:true,
    q:{de:"Wo sind Sie tätig?",en:"Where do you operate?"},
    why:{de:"Entscheidet, ob deutsche Quellen wie BaFin, Bundesbank und Bundestag zusätzlich zu den EU-Quellen ausgewertet werden.",
         en:"Determines whether German sources such as BaFin, the Bundesbank and the Bundestag are evaluated alongside EU sources."},
    o:[{v:"DE",l:{de:"Deutschland",en:"Germany"}},
       {v:"EU",l:{de:"Weitere EU-Staaten",en:"Other EU states"}},
       {v:"3RD",l:{de:"Drittstaaten",en:"Third countries"}}] },

  { key:"act", multi:true,
    q:{de:"Welche Tätigkeiten sind von Ihrer Erlaubnis umfasst?",en:"Which activities does your licence cover?"},
    why:{de:"Der stärkste Filter: Zahlungsverkehr zieht PSD3 und Echtzeitzahlungen nach sich, Anlageberatung MiFID II und MAR.",
         en:"The strongest filter: payments pull in PSD3 and instant payments, advice pulls in MiFID II and MAR."},
    o:[{v:"deposits",l:{de:"Einlagengeschäft",en:"Deposit-taking"}},
       {v:"lending",l:{de:"Kreditgeschäft",en:"Lending"}},
       {v:"payments",l:{de:"Zahlungsverkehr",en:"Payment services"}},
       {v:"custody",l:{de:"Depot und Verwahrung",en:"Custody"}},
       {v:"dealing",l:{de:"Eigenhandel",en:"Dealing on own account"}},
       {v:"advice",l:{de:"Anlageberatung",en:"Investment advice"}},
       {v:"portfolio",l:{de:"Portfolioverwaltung",en:"Portfolio management"}},
       {v:"issuance",l:{de:"Emissionsgeschäft",en:"Underwriting"}}] },

  { key:"prod", multi:true,
    q:{de:"Welche Produkte bieten oder halten Sie?",en:"Which products do you offer or hold?"},
    why:{de:"Produkte lösen eigene Spezialregime aus, unabhängig vom Institutstyp: etwa MiCA bei Kryptowerten.",
         en:"Products trigger their own specialist regimes regardless of entity type: for example MiCA for crypto-assets."},
    o:[{v:"otc",l:{de:"OTC-Derivate",en:"OTC derivatives"}},
       {v:"crypto",l:{de:"Kryptowerte",en:"Crypto-assets"}},
       {v:"covered",l:{de:"Pfandbriefe",en:"Covered bonds"}},
       {v:"mmf",l:{de:"Geldmarktfonds",en:"Money market funds"}},
       {v:"eltif",l:{de:"ELTIF / EuVECA",en:"ELTIF / EuVECA"}},
       {v:"consumer",l:{de:"Verbraucherdarlehen",en:"Consumer credit"}}] },

  { key:"cli", multi:true,
    q:{de:"Welche Kunden bedienen Sie?",en:"Which clients do you serve?"},
    why:{de:"Privatkundengeschäft aktiviert Anlegerschutz- und Produktinformationsregeln, die institutionell entfallen.",
         en:"Retail business activates investor protection and product disclosure rules that do not apply institutionally."},
    o:[{v:"retail",l:{de:"Privatkunden",en:"Retail clients"}},
       {v:"prof",l:{de:"Professionelle Kunden",en:"Professional clients"}},
       {v:"inst",l:{de:"Institutionelle Anleger",en:"Institutional investors"}}] },

  { key:"cross", multi:true,
    q:{de:"Welche Querschnittspflichten treffen Sie?",en:"Which cross-cutting obligations apply?"},
    why:{de:"Querschnittsthemen machen erfahrungsgemäß den größten Teil des laufenden Änderungsaufkommens aus.",
         en:"Cross-cutting topics typically account for the largest share of ongoing regulatory change."},
    o:[{v:"aml",l:{de:"Geldwäscherechtlich verpflichtet",en:"Obliged entity under AML law"}},
       {v:"reporting",l:{de:"Aufsichtliches Meldewesen",en:"Supervisory reporting"}},
       {v:"outsourcing",l:{de:"Wesentliche Auslagerungen",en:"Material outsourcing"}},
       {v:"esg",l:{de:"Nachhaltigkeitsangaben",en:"Sustainability disclosures"}},
       {v:"kritis",l:{de:"Kritische Infrastruktur",en:"Critical infrastructure"}}] }
];
